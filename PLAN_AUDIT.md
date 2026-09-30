# Devil's Advocate Audit — `IMPLEMENTATION_PLAN.md`

Scope: a critical review of the plan against what a **production-grade personal finance app** actually requires. The plan is strong on UI/UX direction and discipline (reuse, small tasks, RLS awareness). It is weak exactly where finance apps fail in production: **money correctness, data model, atomicity, offline, platform policy, operations, and scope.**

Severity legend:

- **P0 — Blocker.** Will cause wrong numbers, data leaks, store rejection, or a rewrite. Fix before writing code.
- **P1 — Major.** Will cause significant rework or production incidents. Fix before the relevant phase.
- **P2 — Minor.** Polish, clarity, or consistency.

---

# Part A — Verdict in one paragraph

The plan is a **feature catalogue with a build order**, not a production plan. It defers every hard decision (money representation, balance model, offline, sync, scheduling, multi-currency, SMS policy, backups) to "later" or "carefully", while committing to build ~20 screens against mock data whose shape has not been designed. The result will be a beautiful UI sitting on a data model that has to be redesigned when real constraints arrive — the most expensive possible order. The fix is not to abandon UI-first, but to put a **thin "contracts first" Phase 0** in front of it (domain model, ledger rules, schema, service interfaces, offline decision), then build **one vertical slice end-to-end**, then go wide.

---

# Part B — P0 Blockers

## B1. Money representation is never specified

**Problem.** Nothing says how amounts are stored or computed. The default in JS/TS is `number` (IEEE-754 float). `0.1 + 0.2 !== 0.3`. Summing thousands of transactions in floats produces drift that users *will* notice in a finance app.

**Required change.**

- Store all amounts as **integer minor units** (`bigint` in Postgres, e.g. paisa for PKR) plus an ISO-4217 `currency` code. Never `float`/`real`/`double precision`.
- In TypeScript, use a `Money` type `{ amountMinor: number | bigint; currency: CurrencyCode }` and a small tested utility module (`add`, `subtract`, `negate`, `allocate`, `format`, `parse`). No arithmetic on raw numbers in components.
- Parsing user input (`"2,500.50"`) → minor units must be a single tested function.
- Formatting goes through one `formatMoney()` (locale-aware, handles sign, `Rs.` prefix, optional hide-amounts mode).
- Signed convention must be documented: e.g. **entry amount > 0 = inflow to the account, < 0 = outflow**.

## B2. "Implement balance calculations carefully" is not a design

**Problem.** The plan never decides whether account balances are **stored** or **derived**. Both unplanned options fail: a stored `balance` column drifts on edits/deletes/partial failures; deriving on the client over a paginated list is impossible.

**Required change — adopt a lightweight ledger:**

- Account balance = `opening balance entry + SUM(entries.amount_minor)` for that account.
- Opening balance is itself a ledger entry (`kind = opening_balance`), not a mutable field.
- Manual corrections are `adjustment` entries, never direct balance edits. This gives an audit trail and a "Reconcile" feature for free.
- Expose balances via a Postgres view/RPC (`get_account_balances()`); optionally cache via trigger with a nightly reconciliation check that alerts on drift.

## B3. Transaction model can't represent real money movement

**Problem.** Section 31 uses `account_id` for normal transactions and `source_account_id`/`destination_account_id` for transfers on the same row. That model breaks on:

- **Split transactions** (one grocery receipt = Food + Household).
- **Transfer fees** (JazzCash/Easypaisa/IBFT charges: Rs. 10,000 sent, Rs. 10,050 debited).
- **Cross-currency transfers** (USD Payoneer → PKR bank: two different amounts).
- **Refunds** linked to an original expense.
- **Credit card payments** (a transfer into a liability account, not an expense).

**Required change — header + entries (splits):**

```text
transactions            (the event: what, when, why)
  id, user_id, kind, occurred_on, occurred_at, payee, notes,
  status (pending|cleared|void), source (manual|sms|ocr|recurring|import),
  source_ref (e.g. bank TID, for dedupe), refund_of_id, recurring_rule_id,
  version, created_at, updated_at, deleted_at

transaction_entries     (the money: which account moved, by how much, categorized how)
  id, user_id, transaction_id, account_id, amount_minor (signed), currency,
  category_id (null for transfer legs), base_amount_minor, fx_rate
```

Invariants (enforced in the write RPC and by constraint triggers):

| kind | entries |
|---|---|
| expense | ≥1 negative entry on one account, each with an expense category (splits) |
| income | ≥1 positive entry with an income category |
| transfer | exactly 2 entries, different accounts, no category, amounts net to zero in base currency (fee = separate expense entry) |
| refund | positive entry, `refund_of_id` set, reduces the original category's spend |
| adjustment / opening_balance | 1 entry, excluded from income/expense analytics |

Analytics rule: **income/expense reports read only `expense`, `income`, `refund` entries.** Transfers, adjustments and opening balances never appear in spend.

## B4. Multi-row writes are not atomic

**Problem.** Supabase's JS client cannot run a multi-statement database transaction. A transfer (2 entries), a split (N entries), editing a transfer, a committee payout, or deleting an account with history done as several client calls **will** half-fail on flaky mobile networks, leaving money created or destroyed.

**Required change.** Every write that touches more than one row goes through a **Postgres function (RPC)** that runs in one DB transaction: `create_transaction(payload)`, `update_transaction(id, version, payload)`, `delete_transaction(id)`, `record_committee_payment(...)`. The client never inserts into `transaction_entries` directly (revoke direct insert/update from `authenticated`).

## B5. RLS as written still leaks across tenants

**Problem.** `user_id = auth.uid()` on each table protects *reads*, but a user can insert a transaction row they own that references **another user's `account_id` or `category_id`**. Depending on views/joins, that can leak or corrupt another user's balances.

**Required change.**

- Every user-owned table (including child tables like `transaction_entries`, `transaction_tags`, `committee_contributions`) carries `user_id NOT NULL`. Not "where appropriate" — **always**.
- Add `UNIQUE (id, user_id)` on parent tables and **composite foreign keys**: `FOREIGN KEY (account_id, user_id) REFERENCES accounts (id, user_id)`. This makes cross-tenant references impossible at the DB level.
- Policy template for every table:

```sql
alter table public.<t> enable row level security;
create policy "<t>_owner" on public.<t>
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
```

  (`(select auth.uid())` is evaluated once per query instead of per row — a known Supabase performance fix.)
- Views must be `with (security_invoker = true)`; `SECURITY DEFINER` functions must `set search_path = ''` and check `auth.uid()` themselves.
- A CI check that fails if any table in `public` has RLS disabled.
- RLS tests (pgTAP or SQL test scripts) are written **with each migration**, not in "Phase 8".

## B6. SMS parsing is assumed to be a normal feature. It isn't.

**Problem.** The plan treats "Bank/Easypaisa/JazzCash message parsing" as a core feature with ON/OFF toggles. Reality:

- **iOS does not allow third-party apps to read SMS. At all.** The feature is Android-only.
- **Android:** `READ_SMS`/`RECEIVE_SMS` are restricted by Google Play. Non-default-SMS apps must submit a **Permissions Declaration** under the "SMS-based money management" exception, and approval is **case-by-case**. You must disclose that the app can access all SMS, show a prominent in-app disclosure, and likely provide a demo video. Rejection or later revocation is a real risk.
- **Expo:** there is no SMS-reading Expo module. You need a custom native module (Expo Modules API + config plugin) and a **development build** — Expo Go will not work. This must be known on day one, not Phase 7.

**Required change.**

- Reframe the feature as **"Smart capture"** with multiple inputs, so the product survives a Play rejection:
  1. **Paste / share-to-app** a message (both platforms, no permissions, ship first).
  2. **iOS Shortcuts automation** ("When I receive a message from X → open app with text") via URL scheme / App Intents.
  3. **Android SMS receiver** (opt-in, behind the Play declaration).
- Parse **on-device only**. Never upload raw message bodies. Store server-side only the parsed fields + a hash for dedupe.
- Explicitly **ignore OTP and non-financial messages** before anything is stored.
- **Dedupe** by `(provider, source_ref/TID, amount, timestamp window)` — the same transaction will arrive via SMS, re-scan, and manual entry.
- Parser rules must be **versioned data** (JSON) updatable via OTA/remote config — bank SMS formats change without notice.
- Maintain a **golden test corpus** of anonymized real messages per provider; every parser change runs against it.

## B7. "Free" infrastructure is not production infrastructure

**Problem.** The plan leans on free tiers. For financial records:

- **Supabase Free has no automatic backups and no PITR**, and projects **pause after ~1 week of low activity**. One bad migration or an accidental `delete` = permanent loss of users' financial history.
- **Free-tier hosted LLMs** commonly allow the provider to use prompts to improve their models. Sending users' transactions to them is a privacy and trust violation.

**Required change.**

- Production database on **Supabase Pro** (daily backups, no pausing), or — at minimum while in beta — a scheduled `supabase db dump` to encrypted off-site storage **plus a tested restore drill**.
- Separate **dev / staging / prod** projects. Never develop against prod.
- AI: only providers whose terms exclude training on API data, only via a server-side proxy, only sending **aggregates** (see B10).

## B8. Offline is deferred, but it dictates the architecture

**Problem.** Section 40 says "consider offline after the online version is stable." Offline capture is table stakes for an expense tracker (users log at the counter, often with poor connectivity), and retrofitting offline onto an online-only Zustand + direct-Supabase architecture is effectively a rewrite of the data layer.

**Required change — decide in Phase 0.** Two viable options:

| Option | What it is | Cost |
|---|---|---|
| **Offline-tolerant (recommended for v1)** | TanStack Query with persisted cache + a persisted mutation queue; **client-generated UUIDs**; all write RPCs **idempotent** (upsert by id); `version` column for conflict detection | Low–medium, fits Supabase well |
| **Local-first** | Local SQLite as source of truth + sync engine (e.g. PowerSync, WatermelonDB, custom) | High, but true offline-first |

Either way, from day one: client-generated IDs, soft deletes (`deleted_at`) as tombstones, `updated_at` maintained by trigger, and a `version` integer for optimistic concurrency (two devices editing the same transaction).

## B9. Zustand is being used for the wrong job

**Problem.** Zustand as "State Management" plus "cache appropriate data" implies server data in Zustand. That means hand-rolling caching, invalidation, pagination, retries, refetch-on-focus, and optimistic updates — badly.

**Required change.**

- **Server state:** TanStack Query (queries, infinite queries for transaction lists, mutations with optimistic updates, persistence for offline).
- **Client/UI state only in Zustand:** filters, selected period, form drafts, hide-amounts toggle, onboarding progress.
- Mock services and Supabase services both return Promises through the **same repository interface**, consumed only via query hooks (`useTransactions(filters)`), never from components directly.

## B10. The AI design has privacy and injection holes

**Problem.**

- "User-provided API keys" and "free-tier hosted models" with no statement of where keys live or what data leaves the device.
- The NL assistant "should query structured data" — but not how. The naive implementation (LLM writes SQL) is a security hole.
- Merchant names, notes and SMS text are **untrusted input** that will be placed into prompts (prompt injection: a payee named "Ignore previous instructions and…").

**Required change.**

- All LLM calls go through a **Supabase Edge Function** that holds the provider key, enforces a **per-user quota/rate limit**, strips PII, and logs usage (not content).
- Default payload = **aggregates** (category totals, deltas, counts), not raw transactions. Raw-row access requires explicit opt-in consent with a clear screen.
- NL assistant uses **tool/function calling against a fixed allow-list of parameterized RPCs** (`get_spend_by_category(from, to)`, `get_top_payees(...)`). Never free-form SQL. Tools are read-only and scoped by `auth.uid()`.
- Every AI answer renders calculated numbers from the tool result, not from model text, and labels generated text as such (the plan already wants this — make it an implementation rule).
- v1 "AI" = deterministic insights only. LLM features are a later, opt-in release.

## B11. Store compliance items are missing

These cause rejections, not bugs:

- **Account deletion** must actually delete: Apple requires in-app deletion; Google Play additionally requires a **web URL** where users can request deletion. Implement as an Edge Function (service role, server-side only) that deletes storage objects, rows, and the auth user.
- **Privacy policy** URL, **Play Data Safety** form, **Apple privacy nutrition labels** — must accurately reflect SMS, camera, analytics, crash reporting, AI.
- If you add Google Sign-In on iOS, Apple requires an equivalent privacy-focused login option (Sign in with Apple is the safe choice).
- Prominent disclosure screens before requesting SMS, camera, and notification permissions.

---

# Part C — P1 Major Issues

## C1. UI-first without contracts guarantees rework

Building 20 screens on hand-written mock arrays means the UI encodes accidental shapes (float amounts, a single `account_id`, no pagination, synchronous data, no errors). Then Phase 5 rewrites it all — which contradicts "Do not rewrite the UI."

**Fix:** keep UI-first, but only after Phase 0 produces `src/domain/` types, zod schemas, the DB schema, and repository interfaces. Mock repositories must:

- implement the exact interface the Supabase repository will,
- return Promises with **simulated latency**, **random failures** (toggleable), and **cursor pagination**,
- be generated from a seeded factory (thousands of realistic transactions, not 12 hand-picked ones — performance problems only show at volume).

## C2. No vertical slice before going wide

The plan builds all UI, then all backend, then all integrations. The riskiest part (ledger + RLS + offline + balances) is proven last.

**Fix:** after Phase 0, build **Accounts + Categories + Transactions (incl. transfers) end-to-end on real Supabase** first. Only then fan out to the remaining screens on mocks.

## C3. Analytics/reports can't be computed on the client

Section 42 paginates transactions (correct), but analytics, budgets, net worth and reports need sums over *all* history. You can't do both on the client.

**Fix:** server-side aggregation RPCs that take a timezone and range: `get_cashflow(from, to, tz, bucket)`, `get_category_breakdown(...)`, `get_budget_status(period)`, `get_net_worth(as_of)`. The mock layer implements the same functions in TS for the UI phase.

## C4. Timezones and period boundaries are undefined

"This month" in Pakistan (UTC+5) differs from UTC for 5 hours at each boundary; a salary credited at 1:00 AM on the 1st would land in the wrong month in UTC.

**Fix:** store `profiles.timezone`. Store `occurred_on date` (the user's local calendar date — what reports group by) plus `occurred_at timestamptz` (exact instant, when known). All period math takes the user's timezone. Use `timestamptz` everywhere, never `timestamp`.

## C5. Net worth double counts

- `assets` has a **Cash** category, and accounts also have **Cash** → counted twice.
- `liabilities` table exists **and** credit cards are accounts → counted twice or inconsistently.
- Loans appear in net worth (§18) but loan tracking is "long-term" (§50).

**Fix — single source of truth:**

- **Accounts** (with `class`: asset or liability) cover cash, bank, wallet, credit card, loan, committee.
- **Holdings** cover only non-account assets: gold, property, stocks, mutual funds, crypto, other — each with a `holding_valuations` history (manual first, price feeds later).
- Drop the separate `liabilities` table.
- Net worth = Σ asset accounts + Σ holdings latest valuation − Σ liability accounts, in base currency.
- **Net worth history requires snapshots**; you cannot reconstruct historical property/gold values after the fact. Add a daily/monthly `net_worth_snapshots` job from the start.

## C6. Committees (ROSCA) accounting is undefined — and the obvious approach is wrong

If contributions are recorded as **expenses** and the payout as **income**, every analytics screen is distorted (a month with a Rs. 300,000 payout looks like a windfall; every other month shows a phantom expense).

**Fix:** model each committee the user participates in as an **account of type `committee`**:

- Monthly contribution = **transfer** bank → committee account.
- Payout = **transfer** committee account → bank.
- Committee account balance = contributed − received. Positive = you're owed (asset); negative after an early payout = you owe future installments (liability). Net worth is automatically correct.

Also decide:

- **Member vs. organizer.** Members are usually *not app users* → `committee_members` references a lightweight `contacts` table, not `auth.users`.
- If the user is the organizer, money collected on behalf of others is **not theirs** → track member payment status as records, and (optionally) a "held for others" liability account.
- Payout order (fixed, draw, bid), missed payments, and early exit rules.

## C7. Recurring transactions and bills have no execution model

Who creates the next occurrence? If the client does it on app open, you get duplicates across devices and missed occurrences when the app isn't opened.

**Fix:**

- Merge bills into recurring: a **bill** is a recurring rule with a due date, reminder, and "requires confirmation".
- `recurring_rules` (frequency, interval, anchor day, end) + `recurring_occurrences` with `UNIQUE (rule_id, due_on)` for idempotency.
- A **server scheduler** (`pg_cron` → function) materializes upcoming occurrences; the user confirms or auto-posts.
- Handle month-end anchors (rule on the 31st in February), paused rules, and editing "this vs. all future" occurrences.

## C8. Budgets semantics are undefined

Define before building the UI: period type (monthly/weekly/custom), whether a parent-category budget includes subcategories, **rollover** on/off, refunds reduce spend, transfers/adjustments excluded, what happens with overlapping budgets, alert thresholds (e.g. 80%/100%) and who evaluates them (server, on transaction write, for push).

## C9. Multi-currency is half-present

Accounts have a `currency` field, but totals, budgets, and net worth have no conversion rule. Pakistani freelancers commonly hold USD (Payoneer, USD bank accounts), so this is not an edge case.

**Fix (choose one explicitly):**

- **v1 single-currency:** all accounts PKR, `currency` field locked; clean, honest.
- **v1 multi-currency (recommended if freelancers are a target):** each entry stores the account-currency amount **and** `base_amount_minor` + `fx_rate` snapshot; an `fx_rates` table for net worth revaluation; the user's base currency is fixed after first data (changing it later is a migration).

## C10. Categories design problems

- Separate `categories` and `subcategories` tables → use **one self-referencing table** (`parent_id`, max depth 2).
- **Delete behavior** is undefined: deleting a category with 500 transactions must require reassign or archive, never cascade.
- System defaults: seed a **per-user copy** on signup (trigger), so users can rename/hide without affecting others.
- `kind` on categories (expense vs. income) so the picker only shows valid ones.
- "Transfer" must not be a category.

## C11. Goals have two sources of truth

`Current amount` (manual) and `Linked account` (derived) conflict. **Pick one per goal:** derived from a linked account's balance, or tracked via explicit goal contributions. Never both.

## C12. Sensitive data handling in the app

- **Session storage:** Supabase JS defaults to AsyncStorage (unencrypted). `expo-secure-store` has value-size limits that sessions can exceed. Use the encrypted-storage pattern (AES key in SecureStore, ciphertext in AsyncStorage/MMKV).
- **App lock:** biometric/PIN lock with timeout (`expo-local-authentication`). Non-negotiable for a finance app.
- **Privacy screen:** blur/hide content in the app switcher; optional screenshot blocking on sensitive screens.
- **Hide amounts** toggle (common, expected).
- **Account identifier:** store last 4 digits only; never full account/IBAN/card numbers.
- **Receipts:** private bucket, path `{user_id}/{uuid}.jpg`, short-lived signed URLs, **strip EXIF (GPS)**, compress before upload.
- **Logs/crash reports:** scrub amounts, payees, notes, message bodies from Sentry breadcrumbs.

## C13. Testing is scheduled last

"Phase 8 — Testing" is too late for a finance app. The ledger math is the product.

**Fix — tests arrive with the code they cover:**

- **Unit (Jest/Vitest):** money utils, ledger invariants, budget math, recurrence expansion, parser (golden corpus), committee math.
- **Database:** RLS tests per table, RPC invariant tests (transfer nets to zero, cross-tenant FK rejected), run against the local Supabase stack in CI.
- **E2E (Maestro):** sign up → add account → add expense → transfer → balances correct → delete account.
- **CI (GitHub Actions):** typecheck, lint, unit, DB tests, migration dry-run on every PR.

## C14. Operations and release engineering are absent

Add a dedicated section covering:

- **Migrations** in git via Supabase CLI; never edit schema in the dashboard for prod. Generated DB types (`supabase gen types typescript`) committed and checked in CI.
- **Environments:** dev / staging / prod Supabase projects; EAS build profiles (development, preview, production) with separate env vars.
- **Builds:** EAS Build + Submit. **Development build from day one** (SMS/OCR native modules rule out Expo Go).
- **OTA updates:** EAS Update with a runtime-version policy; JS-only fixes ship without store review; native changes bump runtime.
- **Minimum supported version / forced update** check at launch (needed when you change RPC contracts).
- **Crash reporting:** Sentry (with PII scrubbing). **Product analytics:** optional, privacy-respecting, opt-out.
- **Feature flags** (remote config) to kill SMS parsing or AI without a release.
- **Backups + restore drill**, uptime monitoring, and a short incident runbook.
- **Beta:** TestFlight + Play internal/closed testing (Play requires closed testing with testers for new personal developer accounts before production — plan the time).

## C15. Scope has no MVP line

50 steps and ~15 modules before "Production release" is a multi-year solo roadmap. "Production grade" means a **small surface done correctly**, not everything half-done.

**Fix:** define releases (see Part E). Everything outside the current release is out of scope, not "later in the same plan".

---

# Part D — P2 Issues and Internal Contradictions

1. **Phase numbering conflicts.** §2 says Phase 2 = Mock Data, Phase 7 = AI, Phase 8 = Testing. The section headings say Phase 2 = Design System (§6), Phase 4 = Mock Data (§24), Phase 7 = Message Parser (§32), Phase 8 = AI (§35). An AI agent following this will be confused about what "Phase N" means.
2. **§45 builds mock services at step 21, after all 20 screens.** That contradicts §24 ("UI should call services rather than directly importing mock arrays") and Rules 3/9. Screens 1–20 will import arrays directly and need refactoring. Services must exist before the first screen.
3. **Unreachable screens.** Net Worth (§18), Categories (§13), and Message Parser / Smart Capture are not in the `More` list (§3).
4. **Refund/adjustment types (§31) have no UI** in the Add Transaction flow (§11).
5. **Duplicates across sections:** Receipt OCR (§34 and §50), net worth history (§18 and §50), custom transaction rules (§33 and §50).
6. **"Available balance" (§12)** is undefined. Meaningful for credit cards (limit − owed) and pending holds; meaningless for cash.
7. **Rule 3 (works offline in UI phase) vs. §40 (offline later)** — two different meanings of "offline"; clarify.
8. **Rule 2 (no Supabase until all UI done) vs. §48 Definition of Done** (which includes backend per feature). Pick one: per-feature vertical completion is the right one after the first slice.
9. **"Dark/light mode if implemented" (§44) vs. Theme setting (§23).** Decide now; tokens must support both from day one or it's a refactor.
10. **Language setting (§23) with no i18n plan.** If Urdu is ever supported, it is **RTL**: externalize strings from day one (i18n library), use `start`/`end` instead of `left`/`right` in styles, and test with RTL forced.
11. **Supabase key naming (§25).** Newer Supabase projects issue **publishable** (`sb_publishable_…`) and **secret** keys alongside legacy anon/service_role. Name the env var generically (`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and document that only the publishable/anon key ships in the app.
12. **Vague library choices.** "A React Native chart library" and "rate limiting where appropriate" are not decisions. Pick and record them (Part F).
13. **`account_types` table** — use a Postgres enum or check constraint; it's code-level behavior, not user data.
14. **`parsed_messages` table** implies storing raw SMS server-side. Store parsed fields + hash only (see B6).
15. **Folder structure ambiguity.** Both `components/transactions/` and `features/transactions/` exist; ownership is unclear. Prefer features owning their components/hooks/repositories, with `components/ui/` for primitives and thin route files in `app/`.
16. **Custom `BottomTabBar` component** — use Expo Router's `Tabs` with a custom `tabBar` only if the design truly needs it.
17. **Accessibility is one bullet** ("Accessible values" on charts). Add: screen-reader labels on amounts ("minus 2,500 rupees, Groceries, today"), Dynamic Type/font scaling without truncating amounts, 44pt touch targets, contrast ≥ 4.5:1, and never color-only income/expense signaling (the `+`/`−` sign convention already helps — keep it mandatory).
18. **Profile currency change** after data exists is undefined (see C9).
19. **No CSV export in the core scope.** Users trust a finance app more when they can leave with their data. Put CSV export in the MVP; import later with dedupe.
20. **No undo.** Deleting a transaction should be soft-delete with an undo snackbar.

---

# Part E — Revised Release Plan

Replace §2 and §45 with this. Each release is shippable on its own.

```text
Release 0 — Foundations (no user-facing features)
  0.1  Decisions locked (Part G) and recorded in docs/decisions/
  0.2  Expo app with development build, Expo Router, TS strict, ESLint/Prettier
  0.3  CI: typecheck, lint, unit tests
  0.4  Domain model: Money utils, types, zod schemas, ledger invariants + tests
  0.5  Repository interfaces + mock implementations (latency, errors, pagination, seeded data)
  0.6  TanStack Query hooks over repositories; Zustand only for UI state
  0.7  Design tokens (light + dark), i18n scaffolding, core UI primitives
  0.8  Supabase dev project, migrations in git, RLS template, RLS CI check, generated types

Release 1 — MVP (the product people actually use daily)
  Vertical slice first, on real Supabase:
  1.1  Auth (email + OAuth), session in encrypted storage, app lock, privacy screen
  1.2  Accounts (asset + liability classes, opening balance entry)
  1.3  Categories (single tree table, per-user seeded defaults)
  1.4  Transactions via RPCs: expense, income, transfer (+fee), split, refund, adjustment
  1.5  Balances via RPC/view, reconcile flow
  Then breadth:
  1.6  Home dashboard, transaction list (cursor pagination, search, filters)
  1.7  Analytics via aggregation RPCs (timezone-aware)
  1.8  Budgets (defined semantics, server-evaluated alerts)
  1.9  Offline capture + mutation queue (per Phase-0 decision)
  1.10 CSV export, account deletion (in-app + web), privacy policy, store listings
  1.11 Sentry, EAS Update, forced-update check, backups + restore drill
  → Closed beta → Production

Release 2 — Planning
  Recurring rules + bills (server scheduler), notifications (local + push)
  Goals (single source of truth), committees (committee account model)
  Holdings + manual valuations, net worth + snapshots

Release 3 — Smart capture
  Paste/share-to-parse (both platforms), iOS Shortcuts hook
  Android SMS receiver behind Play declaration + feature flag
  Parser rules as versioned data + golden corpus, dedupe
  Receipt OCR on-device, confirmation flow

Release 4 — Intelligence
  Deterministic insights (no LLM)
  Opt-in LLM summaries via Edge Function (aggregates only, quota)
  NL assistant via tool-calling over allow-listed RPCs
  Price feeds for holdings, multi-currency revaluation
```

---

# Part F — Recommended Concrete Stack Decisions

Record these (or your alternatives) before coding so Cursor stops improvising.

| Concern | Decision |
|---|---|
| Server state | `@tanstack/react-query` (+ persistence for offline) |
| UI state | `zustand` (UI-only) |
| Forms / validation | `react-hook-form` + `zod` (schemas shared with repositories) |
| Lists | `@shopify/flash-list` |
| Bottom sheets | `@gorhom/bottom-sheet` |
| Charts | Pick one after a 1-day spike with 5k points: a Skia-based library (e.g. `victory-native`) or `react-native-gifted-charts` |
| Dates / TZ | `date-fns` + timezone support; all period math takes the user's timezone |
| IDs | Client-generated UUIDs (v7 preferred for index locality) |
| Secure storage | `expo-secure-store` for keys; encrypted storage for the Supabase session |
| App lock | `expo-local-authentication` |
| Notifications | `expo-notifications` + `push_tokens` table + server sender |
| OCR | On-device ML Kit text recognition via a maintained RN/Expo wrapper (dev build) |
| SMS | Custom Expo native module + config plugin (Android only) |
| Crash reporting | `@sentry/react-native` with PII scrubbing |
| E2E | Maestro |
| DB tests | pgTAP (or SQL test scripts) against local Supabase in CI |
| Builds / OTA | EAS Build, EAS Submit, EAS Update |

---

# Part G — Decisions to Lock Before Any Code

1. **Platforms:** Android-first, iOS-first, or both at launch? (SMS capture is Android-only.)
2. **Offline:** offline-tolerant (queue + cache) or true local-first?
3. **Currency:** single-currency PKR v1, or multi-currency with FX snapshots?
4. **Committee role:** track only my participation, or also organize others' committees?
5. **Auth methods:** email/password, Google, Apple, phone OTP (SMS costs money)?
6. **Hosting budget:** Supabase Pro for prod (recommended), or free + self-managed backups during beta?
7. **AI data policy:** aggregates only, or opt-in raw-row access?
8. **Languages:** English only, or English + Urdu (RTL) from v1?
9. **Monetization:** free, freemium, subscription? (Affects entitlements tables and store setup.)
10. **Team:** solo or team? (Affects how much ceremony — ADRs, PR review, branch protection — is worth it.)

---

# Part H — Non-Functional Targets (make "production grade" measurable)

| Area | Target |
|---|---|
| Correctness | Ledger invariant tests 100% passing; zero balance drift in nightly reconciliation |
| Security | RLS enabled on 100% of `public` tables; cross-tenant tests for every table |
| Performance | Cold start < 2.5 s on a mid-range Android; 60 fps scroll with 10k transactions; p95 RPC < 300 ms |
| Reliability | Crash-free sessions ≥ 99.5%; no data loss on offline → online |
| Data safety | Daily backups; restore drill completed before launch; RPO ≤ 24 h |
| Accessibility | All interactive elements labeled; usable at largest font scale |
| Privacy | No raw SMS, full account numbers, or raw transactions leave the device without explicit consent |

---

# Part I — Replacement for §51 "First Cursor Task"

```text
Create the Release 0 foundation. Do NOT build feature screens yet.

1. Expo app (latest stable SDK) with development build, Expo Router, TypeScript strict.
2. ESLint + Prettier + a CI workflow running typecheck, lint, and tests.
3. src/domain/money.ts: integer minor-unit Money type with add/subtract/negate/
   allocate/parse/format. Full unit tests, including rounding and negative values.
4. src/domain/ types + zod schemas for Account, Category, Transaction, TransactionEntry,
   following the header + entries ledger model in PLAN_AUDIT.md (B3).
5. Ledger invariant functions (validateTransaction) with unit tests for expense,
   income, transfer (with fee), split, refund, adjustment.
6. Repository interfaces (AccountsRepo, CategoriesRepo, TransactionsRepo) and mock
   implementations with simulated latency, toggleable errors, cursor pagination,
   and a seeded generator producing ~5,000 realistic PKR transactions.
7. TanStack Query hooks wrapping the repositories. Zustand only for UI state.
8. Theme tokens (light + dark) and i18n scaffolding (no hardcoded user-facing strings).
9. Tab navigation shell (Home, Transactions, Analytics, Accounts, More) rendering
   placeholder screens that consume the hooks and show loading/empty/error states.

Run typecheck, lint, and tests; fix all issues. Summarize files, decisions, and
anything deferred.
```

---

# Summary of What to Change in `IMPLEMENTATION_PLAN.md`

1. Add **Phase 0 (contracts first)** and replace the phase list with the release plan in Part E.
2. Add a **Money & Ledger** section (B1–B4) and make RPC-only multi-row writes a rule.
3. Rewrite **§26 schema** around the header + entries ledger, single category tree, accounts with asset/liability class, holdings + valuations, committee-as-account, recurring rules + occurrences, composite tenant FKs, soft deletes, `version` columns.
4. Replace **§28 RLS** with the template, composite FKs, `security_invoker` views, and per-migration tests.
5. Rewrite **§32 parser** as Smart Capture with platform realities, on-device parsing, dedupe, and versioned rules.
6. Rewrite **§36–38 AI** around an Edge Function proxy, aggregates-only, and tool-calling over allow-listed RPCs.
7. Move **offline** from §40 into Phase 0 decisions.
8. Replace **Zustand-as-cache** with TanStack Query + Zustand-for-UI.
9. Add **Operations & Release Engineering**, **Compliance**, **App Security**, **i18n/Accessibility**, and **Non-Functional Targets** sections.
10. Move **testing** from the final milestone into every step's Definition of Done.
11. Fix the internal contradictions in Part D.
