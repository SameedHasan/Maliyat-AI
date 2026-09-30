# Maliyat AI — Implementation Plan (v2)

> App name **Maliyat AI** · Android package `com.sameed.maliyat` · deep-link scheme `maliyat://`

> v2 incorporates the findings in `PLAN_AUDIT.md`, adapted to the actual situation:
> a personal app for the owner and a small group of friends, running on the **Supabase Free tier**, with **full offline mode** as a hard requirement. A "Going Public" checklist (§38) covers what changes if the app grows.

---

# 1. Project Overview

## 1.1 Stack

| Layer | Choice |
|---|---|
| App | React Native + Expo (latest stable SDK, **development build**, not Expo Go) |
| Navigation | Expo Router |
| Language | TypeScript (strict) |
| Local database (source of truth on device) | SQLite via `expo-sqlite` + Drizzle ORM |
| Backend / sync target | Supabase (Postgres, Auth, Storage, Edge Functions) — Free tier |
| UI state | Zustand (UI-only state, never server/DB data) |
| Forms / validation | `react-hook-form` + `zod` |
| Lists | `@shopify/flash-list` |
| Bottom sheets | `@gorhom/bottom-sheet` |
| Charts | Chosen after a 1-day spike (§7.4) |
| Dates | `date-fns` with timezone support |
| IDs | Client-generated UUIDs (`uuid` package; v7 for records, v5 for deterministic IDs) |
| Connectivity | `@react-native-community/netinfo` |
| Secure storage | `expo-secure-store` |
| App lock | `expo-local-authentication` |
| Notifications | `expo-notifications` (local notifications only in v1) |
| Crash reporting | `@sentry/react-native` (free tier, PII scrubbed) |
| Builds / updates | EAS Build (or local builds), EAS Update |
| Tests | Jest (unit), SQL/pgTAP tests (database), Maestro (E2E) |

## 1.2 Product Goal

A personal finance app that combines:

- Expense, income, and transfer tracking (with splits, fees, and refunds)
- Bank accounts, wallets, cash, credit cards, loans
- Categories and subcategories
- Budgets
- Analytics and reports
- Holdings (gold, property, stocks, funds, crypto) and net worth
- Committee (ROSCA) tracking
- Recurring transactions and bills
- Financial goals
- Smart capture: pasted/shared messages, Android bank/Easypaisa/JazzCash SMS, receipt OCR
- Insights (deterministic first, optional AI later)

**Works fully offline.** Every feature must be usable with no connection. Sync happens in the background when a connection is available.

The app should feel like a **professional product**, not a demo or college project — even though the first audience is small.

## 1.3 Context and Locked Decisions

| Decision | Choice | Why |
|---|---|---|
| Audience | Owner + a few friends | Keeps compliance and scale needs minimal for now |
| Backend plan | Supabase Free tier | Upgrade path defined in §38 |
| Offline | **Local-first**: SQLite on device is the source of truth; Supabase is the sync/backup target | Offline was a hard requirement; retrofitting it later is a rewrite |
| Platforms | **Android only** for now. No iOS builds, testing, or iOS-specific work. Code stays in cross-platform Expo APIs where it costs nothing, so iOS remains possible later (§39) | SMS capture is Android-only; all users are on Android; halves testing and build effort |
| Distribution | Android APK via EAS internal distribution (no Play Store yet) | Avoids Play's SMS permission review while private |
| Base currency | PKR. Schema stores currency on every amount so multi-currency can be enabled later without a migration | Keeps v1 simple and honest |
| Language | English first; strings externalized and layouts RTL-safe so Urdu can be added | Cheap now, expensive later |
| Auth | Google Sign-In + email/password (with custom SMTP, §28.4) | Supabase's built-in email sender is too restricted for real users |
| AI | Deterministic insights first; LLM features optional and opt-in, aggregates only | Privacy on a free tier |

These decisions are recorded in `docs/decisions/` as short ADRs. Changing one requires updating this plan.

---

# 2. Development Principles

## 2.1 UI First — on a real local database

The UI is still built before any Supabase work, but **not on throwaway mock arrays**. Instead:

- The local SQLite database and domain model are created first (Phase 0).
- A **seed generator** fills the local database with realistic data (≈5,000 transactions over 18 months).
- Every screen reads and writes the local database through repositories.
- Because the local database is the production data layer, the UI never has to be rewired when Supabase is added. Supabase only adds **auth + sync**.

This keeps UI-first development fast while guaranteeing the UI is built on the real data shapes.

## 2.2 Money correctness is the product

- Money is **never** a floating-point value (§5).
- Balances are **derived from ledger entries**, never stored as an editable number (§6).
- Every multi-row write is **atomic** (§6.5).

## 2.3 Tests arrive with the code

Money utilities, ledger rules, budget math, recurrence expansion, sync, and parsers get unit tests **in the same task** that creates them. Testing is not a final phase.

## 2.4 Small, shippable steps

One module per task. Each task ends with typecheck, lint, tests, and a run on a device/emulator.

---

# 3. Phase Overview

```text
Phase 0  Foundation & Contracts
         Expo dev build, TS, lint, CI, domain model, money utils, ledger rules,
         local SQLite schema + migrations, repositories, seed data, theme, i18n, nav shell
    ↓
Phase 1  Core UI on the local database (fully offline by design)
         Accounts, categories, transactions (all kinds), home, transaction list,
         analytics, budgets, settings basics
    ↓
Phase 2  Supabase: Auth + Server Schema + Sync
         Migrations, RLS, sync RPCs, outbox/pull engine, auth, backups
    ↓
── Milestone: MVP for friends (internal APK) ──
    ↓
Phase 3  Planning modules
         Recurring + bills, notifications, goals, committees, holdings, net worth, reports, export
    ↓
Phase 4  Smart capture
         Paste/share parsing, Android SMS, parser rules, receipt capture + OCR
    ↓
Phase 5  Insights
         Deterministic insights, optional LLM summaries and assistant
    ↓
Phase 6  Hardening
         Performance pass, security/RLS audit, restore drill, polish
```

Section 36 lists the exact task order.

---

# 4. Architecture

## 4.1 Target Architecture

```text
                        Expo App (device)
 ┌──────────────────────────────────────────────────────────┐
 │  UI (screens, components)          Zustand (UI state)    │
 │            │                                             │
 │     Feature hooks (useTransactions, useBalances, ...)    │
 │            │                                             │
 │     Repositories  ── domain rules (money, ledger, zod)   │
 │            │                                             │
 │     Local SQLite (Drizzle)  ← source of truth on device  │
 │      ├── domain tables                                   │
 │      ├── outbox (pending changes)                        │
 │      └── sync_state / sync_conflicts                     │
 │            │                                             │
 │     Sync engine (push outbox, pull changes)              │
 └────────────┼─────────────────────────────────────────────┘
              │  HTTPS (only when online)
 ┌────────────┴─────────────────────────────────────────────┐
 │  Supabase                                                │
 │   Auth · Postgres (RLS) · sync_push / sync_pull RPCs     │
 │   Storage (receipts) · Edge Functions (account delete,   │
 │   optional AI proxy)                                     │
 └──────────────────────────────────────────────────────────┘
```

The app must remain fully functional when:

```text
Offline
Supabase is paused or down
AI is unavailable
Smart capture is disabled
```

Core finance functionality never depends on the network or AI.

## 4.2 Data Flow Rules

- **UI never talks to Supabase.** Only the sync engine and the auth module do.
- **UI never runs raw SQL.** Screens use feature hooks; hooks use repositories.
- **Reads** come from SQLite via Drizzle live queries (reactive — screens update automatically when data changes, including after a sync).
- **Writes** go through repositories, which in **one SQLite transaction**: validate with domain rules → write domain rows → append an outbox entry.
- **Sync** runs in the background and never blocks the UI.

## 4.3 Why no TanStack Query

With local-first, all reads are local and reactive. A server-cache library adds a second cache with no benefit. Zustand holds only UI state (filters, selected period, form drafts, hide-amounts toggle, sync status display).

## 4.4 Folder Structure

```text
src/
├── app/                      # Expo Router routes only — thin files that render feature screens
│   ├── _layout.tsx
│   ├── (auth)/
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── home.tsx
│   │   ├── transactions.tsx
│   │   ├── analytics.tsx
│   │   ├── accounts.tsx
│   │   └── more.tsx
│   └── ...                   # stack routes per feature
│
├── features/                 # each feature owns its screens, components, hooks
│   ├── accounts/
│   ├── categories/
│   ├── transactions/
│   ├── analytics/
│   ├── budgets/
│   ├── recurring/
│   ├── goals/
│   ├── committees/
│   ├── holdings/
│   ├── net-worth/
│   ├── reports/
│   ├── capture/
│   ├── insights/
│   └── settings/
│
├── components/ui/            # design-system primitives only
├── domain/                   # pure TS, no React, fully unit-tested
│   ├── money.ts
│   ├── ledger.ts
│   ├── recurrence.ts
│   ├── budgets.ts
│   ├── committees.ts
│   ├── types.ts
│   └── schemas.ts            # zod
├── db/
│   ├── schema/               # Drizzle table definitions (mirror server schema)
│   ├── migrations/           # generated by drizzle-kit
│   ├── client.ts             # opens the per-user database
│   └── seed/                 # dev seed generator
├── data/repositories/        # all reads/writes; writes also append to outbox
├── sync/                     # engine, push, pull, conflicts, file uploads
├── lib/supabase/             # client + auth only
├── store/                    # Zustand UI stores
├── i18n/
├── theme/
└── utils/

supabase/
├── migrations/               # SQL migrations (source of truth for server schema)
├── tests/                    # RLS + RPC tests
├── functions/                # Edge Functions
└── seed.sql                  # local dev only

docs/decisions/               # ADRs
```

---

# 5. Money

## 5.1 Representation

- All amounts are **integer minor units** (paisa for PKR) with an ISO-4217 currency code.
- Postgres: `bigint`. SQLite: `INTEGER`. TypeScript: `number`, asserted with `Number.isSafeInteger` (safe up to ~90 trillion rupees in paisa).
- Never `float`, `real`, `double precision`, or `numeric` for stored amounts.

```ts
type CurrencyCode = 'PKR' | 'USD' | 'AED' | 'SAR' | 'GBP' | 'EUR';

interface Money {
  amountMinor: number;   // integer, signed where meaningful
  currency: CurrencyCode;
}
```

## 5.2 `src/domain/money.ts`

One module, fully tested, used everywhere:

```text
money(amountMinor, currency)
add(a, b)            # throws on currency mismatch
subtract(a, b)
negate(a)
sum(list)
allocate(total, ratios)   # splits without losing paisa (largest remainder)
parseMoneyInput("2,500.50", currency) -> Money | error
formatMoney(money, { sign, hide, compact })
```

Rules:

- No arithmetic on amounts outside this module.
- `formatMoney` is the only way amounts reach the screen. It supports:
  - explicit sign: `+ Rs. 50,000` / `- Rs. 2,500`
  - hide-amounts mode: `Rs. •••••`
  - compact mode for charts: `Rs. 1.2M`
- Amounts are always displayed with a sign prefix for income/expense, never color alone.

## 5.3 Sign Convention

**Entry amount > 0 = money flowing into that account. Entry amount < 0 = money flowing out.**

- Expense on a bank account: negative entry.
- Salary into a bank account: positive entry.
- Credit card purchase: negative entry on the credit card account (balance becomes more negative = more owed).
- Credit card payment: transfer — negative on bank, positive on credit card.

---

# 6. Ledger

## 6.1 Model: Transaction Header + Entries

```text
transactions            the event: what happened, when, why
transaction_entries     the money: which account moved, by how much, which category
```

A transaction has one or more entries. This supports splits, fees, transfers, refunds, and multi-currency without special cases.

## 6.2 Transaction Kinds and Invariants

| kind | entries | counts in income/expense? |
|---|---|---|
| `expense` | ≥ 1 negative entry, all on the same account, each with an expense category (multiple = split) | Yes |
| `income` | ≥ 1 positive entry, same account, each with an income category | Yes |
| `transfer` | exactly 2 entries on different accounts, no category, amounts net to zero | No |
| `transfer` with fee | 2 transfer entries + 1 negative fee entry with an expense category (e.g. Bank Charges) | Only the fee |
| `refund` | positive entry with an expense category; `refund_of_id` optionally links the original | Yes — reduces that category's spend |
| `adjustment` | 1 entry, no category; used by reconcile | No |
| `opening_balance` | 1 entry, no category; created with the account | No |

Invariants live in `src/domain/ledger.ts` (`validateTransaction`) and are enforced:

1. In the repository before writing locally.
2. Again on the server inside `sync_push` (§27).

**Transfers are never expenses.** Analytics and budgets read only `expense`, `income`, and `refund` entries.

## 6.3 Balances

```text
account balance = SUM(transaction_entries.amount_minor)
                  WHERE account_id = X AND transaction not deleted AND status != 'void'
```

- The opening balance is an `opening_balance` entry, not a field.
- Users never edit a balance directly. **Reconcile** asks "What's the actual balance?" and creates an `adjustment` entry for the difference.
- Balances are computed with SQL aggregates in SQLite (fast enough for personal data volumes; add an index on `(account_id)`).

## 6.4 Account Classes

| type | class | notes |
|---|---|---|
| cash, bank, wallet | asset | |
| credit_card | liability | Balance is negative when money is owed. **Available credit = credit_limit + balance.** |
| loan | liability | Borrowed money. Repayments are transfers; interest is an expense. |
| committee | asset or liability depending on sign | See §17 |
| other_asset / other_liability | asset / liability | Catch-all |

"Available balance" is shown **only** for credit cards (available credit). For other accounts, only the current balance is shown.

## 6.5 Atomicity

- Locally: every repository write runs in **one SQLite transaction** (header + all entries + outbox row). It either fully happens or not at all.
- On the server: `sync_push` applies each transaction aggregate (header + entries) in **one Postgres transaction**.
- The client never writes entries individually to the server.

## 6.6 Editing and Deleting

- Editing a transaction replaces its entries as a unit and bumps `version`.
- Deleting is a **soft delete** (`deleted_at`) with an **Undo** snackbar.
- Deleting an account with history is not allowed; the account is **archived** instead.
- Deleting a category with transactions requires choosing a replacement category, or archiving it.

---

# 7. Design System

## 7.1 Direction

The UI should be:

- Professional, clean, minimal, modern
- Information-dense without feeling crowded
- Mostly neutral colors, good typography, strong spacing system
- Subtle borders/dividers, minimal decorative cards
- No unnecessary gradients, colorful backgrounds, or accordion UI
- Never a "college project" look

Color is used only for: income, expense, positive/negative movement, important statuses, charts, alerts. Do not make every card a different color.

## 7.2 Tokens

Defined in `src/theme/` — **light and dark from day one**:

```text
colors (semantic): primary, background, surface, surfaceAlt, text, textSecondary,
                   textMuted, border, divider, income, expense, success, danger,
                   warning, info, chart1..chart6
typography:        display, title, heading, body, bodySmall, caption, mono (amounts)
spacing:           4-point scale
radius, shadows, borders, iconSizes, hitSlop
```

Rules:

- No hardcoded colors, font sizes, or spacing in components.
- Amounts use tabular (monospaced) figures so columns align.
- Use `start`/`end` instead of `left`/`right` in styles (RTL-safe).
- All user-facing strings go through i18n (`src/i18n/en.json`).

## 7.3 Components

Primitives (`src/components/ui/`):

```text
Screen, Header, Button, IconButton, TextInput, AmountInput, SearchInput,
Select, DatePicker, SegmentedControl, Chip, Badge, Avatar, Divider,
EmptyState, LoadingState, ErrorState, BottomSheet, Modal, Snackbar (with Undo),
ListItem, SectionHeader, Stat, ProgressBar, MoneyText, PercentageText,
TrendIndicator, OfflineBanner, SyncStatusIndicator
```

Feature components (owned by their feature folder):

```text
TransactionRow, AccountRow, CategoryRow, BudgetRow, GoalRow, CommitteeRow,
HoldingRow, CategoryPicker, AccountPicker
```

- `MoneyText` is the only component that renders amounts (wraps `formatMoney`, respects hide-amounts, sets an accessibility label like "minus 2,500 rupees").
- Bottom tabs use Expo Router `Tabs`; a custom `tabBar` only if the design needs it.

## 7.4 Chart Library Spike

Before building analytics, spend at most one day comparing a Skia-based library (e.g. `victory-native`) and `react-native-gifted-charts` against:

- 60 fps with 12–24 months of data on a mid-range Android device
- Line, bar, donut, progress
- Accessibility (values readable by screen reader)
- Dark mode

Record the choice as an ADR.

## 7.5 Accessibility

- Every interactive element has an accessibility label.
- Layouts survive the largest system font size without truncating amounts.
- Touch targets ≥ 44 pt.
- Text contrast ≥ 4.5:1 in both themes.
- Income/expense never signaled by color alone (sign prefix is mandatory).

---

# 8. Navigation

Bottom tabs:

```text
Home · Transactions · Analytics · Accounts · More
```

`More` contains:

```text
Budgets
Goals
Net Worth
Holdings
Committees
Recurring & Bills
Reports
Categories
Smart Capture
Profile
Settings
```

Global elements:

- **Add** action reachable from Home and Transactions (Expense / Income / Transfer).
- **OfflineBanner** when offline (subtle, non-blocking).
- **SyncStatusIndicator** in Settings and the Home header: synced / syncing / X pending / needs attention.

---

# 9. Screens

All screens must have loading, empty, error, and populated states. Loading states are brief because data is local; they matter mostly on first launch and after sign-in.

## 9.1 Onboarding & Auth

```text
Welcome
Sign in (Google / email)
Create account
Forgot / reset password
First-run setup:
    Base currency (PKR default)
    Timezone (auto-detected, Asia/Karachi default)
    First account + opening balance
    Choose default categories (pre-selected set)
App lock setup (biometric / PIN)
```

During Phase 1, auth is bypassed with a local "dev user"; the real flow arrives in Phase 2.

## 9.2 Home

```text
Header: greeting, avatar, sync status
Total balance (asset accounts − liability accounts) + change this month
Quick actions: + Expense · + Income · Transfer
Income / Expense this month
Spending chart (this month vs last month)
Recent transactions (5)
Accounts overview
Budget progress (top 3)
Upcoming bills (Phase 3)
Goal progress (Phase 3)
Insight preview (Phase 5)
```

Scrollable. Do not overload the first viewport. A hide-amounts eye toggle is in the header.

## 9.3 Transactions

```text
List grouped by date (keyset pagination, FlashList)
Search (payee, notes)
Filters: date range, kind, category, account, tag, amount range, source (manual/sms/ocr/recurring)
```

Row:

```text
Icon · Payee or category · Date · Account · Amount (+ Rs. 50,000 / - Rs. 2,500)
Split indicator when multiple categories
Pending/unsynced dot (subtle) when not yet synced
```

Transaction detail: all fields, entries (for splits/transfers), receipt thumbnails, source, edit, duplicate, delete (with undo), "Create refund" for expenses.

## 9.4 Add / Edit Transaction

Separate entry points for **Expense**, **Income**, **Transfer**, sharing one form engine.

Fields:

```text
Amount (AmountInput, calculator-style)
Account (or From / To for transfers)
Category + subcategory (expense/income only)
Split into categories (optional; remaining amount shown live)
Transfer fee (optional; transfers only)
Date (defaults to today in the user's timezone)
Payee / merchant
Notes
Tags
Receipt (Phase 4)
Make recurring (Phase 3)
```

Also available from the transaction detail or account screen:

```text
Refund (linked to an original expense)
Reconcile / adjust balance (from account detail)
```

Validation comes from the shared zod schema + `validateTransaction`.

## 9.5 Accounts

```text
Grouped: Cash · Bank · Wallets · Credit Cards · Loans · Committees · Other
Each group shows its subtotal; liabilities shown as amounts owed
```

Account detail:

```text
Name, institution, last 4 digits
Current balance
Available credit (credit cards only)
This month: income, expenses, transfers in/out
Balance history chart
Recent transactions
Reconcile
Archive
```

Add account:

```text
Name
Type
Institution (optional)
Currency (locked to PKR in v1)
Opening balance (creates an opening_balance entry)
Credit limit (credit cards only)
Last 4 digits (optional — never store full account/IBAN/card numbers)
```

## 9.6 Categories

Single tree (parent → child, max depth 2), separate expense and income trees.

```text
Food
    Groceries
    Restaurants
    Fast Food
    Coffee
Transport
    Fuel
    Taxi
    Public Transport
```

Features: create, create subcategory, edit, reorder, archive/unarchive, assign icon, assign color (muted palette), delete (only with a replacement category if used).

Default categories are copied into the user's local database at first-run setup so they can be freely renamed/hidden.

## 9.7 Analytics

```text
Spending overview
Income vs expense
Category breakdown (drill into subcategories)
Monthly trend
Spending by account
Top payees
Savings rate = (income − expense) / income
```

Periods: Week · Month · 3 Months · 6 Months · Year · Custom.

All period boundaries use the user's timezone (§25.4). All numbers come from SQL aggregates in the local database (`src/data/repositories/analytics.ts`).

Every chart has a clear label, the selected period, empty and loading states, and accessible values.

## 9.8 Budgets

```text
Budgets list, budget detail, create, edit
```

Example:

```text
Food (incl. subcategories)
Budget       Rs. 30,000
Spent        Rs. 22,500
Remaining     Rs. 7,500
75%
```

Semantics (implemented in `src/domain/budgets.ts`, unit-tested):

- Period: monthly (default), weekly, or custom date range.
- Scope: one or more categories; a parent category includes its subcategories.
- Spent = expense entries − refund entries in scope, in the period. Transfers, adjustments, and opening balances never count.
- Rollover: optional; unused (or overspent) amount carries into the next period.
- Alerts at configurable thresholds (default 80% and 100%), evaluated locally after each write → local notification (Phase 3).

## 9.9 Settings & Profile

```text
Profile (name, avatar)
Base currency (read-only after first transaction)
Timezone
Language (English; Urdu later)
Theme (system / light / dark)
Security: app lock, lock timeout, hide amounts by default, block screenshots
Notifications (Phase 3)
Smart capture (Phase 4)
AI (Phase 5)
Sync: status, last synced, pending changes, "Sync now", "Full resync", conflicts
Data: export CSV / JSON, import (later)
Sign out (warns if unsynced changes exist)
Delete account
```

Screens for later phases (goals, committees, holdings, net worth, recurring, reports, capture) are specified in their phase sections.

---

# 10. Phase 0 — Foundation & Contracts

## Objective

Create everything the UI will stand on, so no later phase rewrites it.

## Tasks

1. Initialize Expo (latest stable SDK) with `expo-dev-client`, Expo Router, TypeScript strict.
2. ESLint + Prettier; path aliases (`@/domain`, `@/features`, ...).
3. GitHub Actions CI: typecheck, lint, unit tests on every push.
4. `src/domain/money.ts` + tests.
5. `src/domain/types.ts` and `schemas.ts` (zod) for all core entities.
6. `src/domain/ledger.ts` (`validateTransaction`, `computeBalance`) + tests covering every row of the table in §6.2.
7. Drizzle schema for the core local tables (§25) + generated migrations + `useMigrations` on app start.
8. Repositories for accounts, categories, transactions (reads + atomic writes that append to the outbox — the outbox is written even though sync doesn't exist yet).
9. Seed generator: realistic PKR data (salary, rent, groceries, fuel, JazzCash/Easypaisa transfers, card payments, refunds, splits) over 18 months, ≈5,000 transactions. Dev menu: "Reset & seed", "Clear".
10. Theme tokens (light/dark), i18n scaffolding, core UI primitives from §7.3.
11. Tab navigation shell with placeholder screens that already read from repositories and show loading/empty/error states.

## Done when

- App runs on an Android device from a development build.
- Seeded data is visible in placeholder lists.
- CI is green with money + ledger tests.

---

# 11. Phase 1 — Core UI on the Local Database

## Objective

A complete, polished, **fully offline** single-device app for the core features. No Supabase.

## Order

```text
1.1  Accounts (list, detail, add, edit, archive, reconcile)
1.2  Categories (tree, CRUD, reorder, archive, delete-with-replacement)
1.3  Add/Edit transaction: expense, income, transfer (+fee), split, refund
1.4  Transactions list (pagination, search, filters, detail, undo delete)
1.5  Home dashboard
1.6  Chart library spike (§7.4) → Analytics
1.7  Budgets
1.8  Settings basics (theme, hide amounts, app lock, export CSV)
```

## Rules

- Screens use feature hooks only; no Drizzle or SQL in components.
- Use seeded data, but also test every screen on an **empty** database (fresh install).
- Performance check with the 5,000-transaction seed: list scroll at 60 fps, home screen renders < 500 ms.

## Done when

- A single user can manage all core finances on one device with no network.
- All screens pass the Definition of Done (§37).

---

# 12. Phase 2 — Supabase: Auth, Server Schema, Sync

## Objective

Multi-device backup/sync and real accounts for the owner and friends, without changing any screen.

## Order

```text
2.1  Supabase CLI + local Supabase (Docker) for development
2.2  Server migrations mirroring the local schema (§26), with composite tenant FKs
2.3  RLS on every table + RLS tests (§28)
2.4  sync_push / sync_pull RPCs + tests (§27)
2.5  Auth in the app: Google + email, custom SMTP, session persistence (§28.3)
2.6  Per-user local database + sign-out handling (§27.8)
2.7  Sync engine on the client: outbox push, delta pull, retries, conflicts (§27)
2.8  Sync UI: status indicator, pending count, conflicts screen, "Sync now", "Full resync"
2.9  Account deletion Edge Function
2.10 Cloud project (Free tier) + nightly backup workflow + keep-alive (§33)
2.11 Sentry + EAS Update + internal distribution build
```

## Done when

- Two devices signed into the same account converge after offline edits on both.
- A second user cannot see or reference the first user's data (tests prove it).
- Nightly backup has run successfully and a restore into local Supabase has been tested once.

**── Milestone: MVP for friends ──**

---

# 13. Recurring Transactions & Bills (Phase 3)

Bills are recurring rules with a due date and reminder. One module, not two.

## Rule fields

```text
Name
Transaction template (kind, amount, account, category, payee)
Frequency: daily / weekly / monthly / yearly, with interval (every N)
Anchor: day of month (with "last day of month" option) or weekday
Start date, optional end date
Is bill (shows in Bills view, has due-date semantics)
Reminder: N days before (local notification)
Auto-post: on (create transaction automatically) / off (ask to confirm)
Paused
```

## Execution model (works offline, no server scheduler)

- `src/domain/recurrence.ts` expands a rule into due dates (tested for month-end, leap years, February 29/30/31 anchors, pauses, end dates).
- On app open and after sync, the app materializes occurrences for the next 60 days.
- Each occurrence has a **deterministic ID**: `uuidv5(rule_id + due_on)`. Two devices generating the same occurrence produce the same ID, so sync deduplicates it automatically.
- Auto-post rules create the transaction on/after the due date; the transaction ID is also deterministic (`uuidv5('txn' + occurrence_id)`).
- Editing a rule offers "This occurrence only" or "This and future".

## Views

```text
Recurring: all rules, next occurrence, monthly total of active subscriptions
Bills: Upcoming · Overdue · Paid
Bill detail: history, mark paid (creates/links the transaction), skip
```

---

# 14. Notifications (Phase 3)

All notifications are **local** (`expo-notifications`) — they work offline and need no push server or cost.

```text
Bill reminder
Recurring transaction due / auto-posted
Budget threshold reached
Committee contribution due
Goal milestone
Unusual spending (Phase 5)
```

- Scheduled/rescheduled after each relevant write and after sync.
- Each type can be toggled in Settings; quiet hours supported.
- Permission requested only when the user enables the first reminder, with an explanation screen.

Push notifications are out of scope until §38.

---

# 15. Goals (Phase 3)

Fields:

```text
Name
Target amount
Target date (optional)
Tracking mode:
    Linked account — progress = that account's balance
    Contributions  — progress = sum of goal contributions
Notes
```

A goal uses **exactly one** tracking mode; there is no manually edited "current amount".

Detail: progress, required monthly amount to hit the target date, contribution history (contributions mode), projected completion date.

---

# 16. Holdings & Net Worth (Phase 3)

## 16.1 Holdings

Holdings are **non-account** assets only. Cash, bank, and wallet money are accounts, never holdings (prevents double counting).

```text
Gold (unit: tola / gram)
Property
Stocks (PSX or other)
Mutual funds
Crypto
Other
```

Holding detail:

```text
Quantity + unit
Purchase lots (date, quantity, cost)
Invested amount (sum of lot costs)
Current value (latest valuation)
Profit / loss, return %
Valuation history
```

Valuations are **manual** in v1 ("Update value"). Price feeds are a Phase 5+ option.

Buying a holding is **not an expense**. It is recorded as a negative entry on the paying account with the system category **"Investments"** (`kind = system`, excluded from spending analytics and budgets), plus a purchase lot on the holding. Selling is the reverse. This keeps spending analytics clean while account balances stay correct.

## 16.2 Net Worth

```text
Total assets      = Σ asset-class account balances + Σ latest holding valuations
Total liabilities = Σ |liability-class account balances|
Net worth         = assets − liabilities
```

Breakdown:

```text
Cash · Bank · Wallets · Holdings by type · Committees (receivable)
Credit cards · Loans · Committees (payable) · Other liabilities
```

**Net worth history requires snapshots** because historical holding values can't be reconstructed later:

- The app writes one `net_worth_snapshots` row per user per day it is opened (deterministic ID `uuidv5(user_id + date)`), plus month-end snapshots.
- The history chart reads snapshots.

---

# 17. Committees / ROSCA (Phase 3)

## 17.1 Accounting model

Committee contributions are **not expenses** and payouts are **not income**. Each committee the user participates in gets an **account of type `committee`**:

```text
Monthly contribution  = transfer: bank → committee account
Receiving the payout  = transfer: committee account → bank
Committee balance     = contributed − received
    positive → others owe you (asset / receivable)
    negative → you received early and owe future installments (liability)
```

Net worth and spending analytics are automatically correct.

## 17.2 Roles

- **Member** (v1): track my contributions and my payout turn.
- **Organizer** (v1, tracking only): track which members paid each round and who receives the payout. Money collected from others is **not the organizer's money** — member payments are recorded as status records, not ledger entries. Optionally the organizer can use a "Held for committee" liability account if they physically hold the cash.

Members are **contacts** (name, optional phone), not app users.

## 17.3 Screens

Committee list: Active · Completed.

Committee detail:

```text
Name, role
Contribution amount, frequency, number of members, start date
My payout turn (and date)
Next contribution due
Collection progress for the current round (organizer)
Payout schedule (round → recipient → date → status)
Committee account balance (receivable/payable)
```

Members (organizer): member, payout turn, paid rounds, pending amount, payout status.

Contribution history: round, due date, status (paid / pending / late), linked transaction.

## 17.4 Rules to implement (`src/domain/committees.ts`, tested)

- Schedule generation from start date, frequency, member count.
- Payout order: fixed order in v1 (draw/bid later).
- Late/missed contribution flags.
- Completion when all rounds are paid out.

---

# 18. Reports & Export (Phase 3)

Reports:

```text
Monthly summary
Income report
Expense report (by category, by payee)
Account report
Budget report
Net worth report
Holdings report
Committee report
```

Each: date range, charts, totals, comparison with the previous period.

Export (all local, works offline):

- **CSV** of transactions (one row per entry, with transaction ID so splits are reconstructable) — delivered in Phase 1.8.
- **JSON full backup** of all user data — Phase 3.
- **PDF monthly report** — optional, later.
- Shared through the system share sheet.

Import (later): CSV with column mapping and dedupe by `(date, amount, payee)` fingerprint.

---

# 19. Phase 4 — Smart Capture

## 19.1 Platform reality

- The app is Android-only, so SMS capture is available to every user.
- **Android** allows it with `READ_SMS` / `RECEIVE_SMS`. While distributed as a private APK this works freely. **If ever published on Google Play**, it requires a Permissions Declaration under "SMS-based money management", approval is case-by-case, and a prominent in-app disclosure is required (§38).
- There is no Expo SMS module: a **custom native module** (Expo Modules API + config plugin) is required. The development build from Phase 0 makes this possible.

## 19.2 Capture sources (built in this order)

```text
1. Paste / share-to-app       no permissions; also the fallback if SMS permission is denied
2. SMS receiver               new incoming messages, opt-in
3. SMS inbox scan             last N days, opt-in, one-time or on demand
```

## 19.3 Pipeline (all on-device)

```text
Receive text
  ↓
Pre-filter: drop OTPs, promos, non-financial messages (never stored)
  ↓
Identify provider (sender ID + patterns): bank X, Easypaisa, JazzCash, card
  ↓
Extract: amount, direction (debit/credit), counterparty/merchant, date/time,
         reference/TID, account hint (last 4), fee, balance-after (if present)
  ↓
Map to account (by provider + last 4) and suggest category (payee rules)
  ↓
Dedupe: fingerprint = hash(provider, reference, amount, date) — skip if seen
  ↓
Create a capture draft
  ↓
User confirms / edits / dismisses  →  transaction (source = 'sms' | 'paste')
```

- Confirmation is required initially. "Auto-log trusted" can be enabled per provider after the user has confirmed N drafts from it without edits.
- Transfers between the user's own accounts (e.g. bank → JazzCash) should be detected and offered as a **transfer**, not an expense.

## 19.4 Privacy

- Raw message bodies **never leave the device** and are not synced.
- Only the confirmed transaction (and a fingerprint hash for dedupe) is synced.
- Drafts store the raw text locally and delete it once confirmed or dismissed (or after 30 days).
- Settings: master toggle, per-provider toggles, auto-log toggles, "Delete all capture data".

## 19.5 Parser rules as data

- Provider templates live in versioned JSON (`src/features/capture/rules/*.json`), not scattered code, so they can be updated via EAS Update when banks change formats.
- A **golden test corpus** of anonymized real messages per provider (`__fixtures__/sms/<provider>/*.txt` with expected outputs). Every parser change runs against it in CI.
- When a message from a known sender fails to parse, offer "Report format" which creates a **locally anonymized** sample the owner can add to the corpus.

## 19.6 Payee rules

User-editable rules map payee text to category/payee name:

```text
contains "KFC"      → Food > Fast Food
contains "PSO"      → Transport > Fuel
contains "NETFLIX"  → Entertainment > Subscriptions
```

- Ships with a starter set; user rules override defaults.
- When the user re-categorizes a captured transaction, offer "Always categorize <payee> as <category>?".
- Rules are synced (they are user data).

## 19.7 Receipts & OCR

```text
Camera / gallery
  ↓
Compress (max ~1600px, JPEG ~0.7, target < 300 KB) and strip EXIF (GPS)
  ↓
Save to app storage (works offline) and attach to a draft or transaction
  ↓
On-device OCR (ML Kit text recognition via a maintained RN/Expo wrapper)
  ↓
Extract merchant, total, date (items optional, best-effort)
  ↓
Draft → user confirmation
  ↓
Upload queue: file uploaded to Storage when online (§27.7)
```

Never auto-save OCR results without confirmation.

---

# 20. Phase 5 — Insights & AI

## 20.1 Deterministic insights first (no LLM, local)

Computed in `src/features/insights/` from local SQL:

```text
"You spent 18% more on food than last month."
"Your savings rate increased from 21% to 27%."
"You have Rs. 4,850/month in recurring subscriptions."
"Transport spending is above your 3-month average."
"Unusual: Rs. 45,000 at <payee> is 5× your typical transaction there."
"Bill <name> is due in 2 days."
```

These cover most of the value and cost nothing.

## 20.2 Optional LLM features (opt-in)

Only after deterministic insights ship. All behind an `AIProvider` interface so providers can be swapped.

```text
AIService
├── summarizeMonth()
├── explainSpending()
├── suggestCategory()
└── answerQuestion()
```

Rules:

- **Opt-in** per user with a clear explanation of what is sent.
- All calls go through a **Supabase Edge Function**; provider keys never live in the app.
- The Edge Function enforces a **per-user daily quota** (free-tier friendly).
- Default payload = **aggregates only** (category totals, deltas, counts, period). No raw transactions, notes, account numbers, or message text.
- Free-tier model providers may use prompts for training — check terms; aggregates-only makes this acceptable for a small private group.
- The assistant never writes SQL. It uses **tool calling over a fixed allow-list** of local query functions (`spendByCategory(from, to)`, `topPayees(from, to, n)`, `balances()`, `subscriptions()`); the app executes the tools locally and sends only results.
- Payee names and notes are untrusted text (prompt injection) — pass them as data, never as instructions, and prefer aggregates.
- Every answer displays the calculated numbers from tool results, visually separated from generated text.
- The app works fully without AI; offline, AI features show "Available when online".

Optional alternative: user-provided API key stored in `expo-secure-store`, calling the provider directly from the device (no server cost).

---

# 21. Security

## 21.1 On device

- **App lock**: biometric/PIN on launch and after a configurable background timeout.
- **Privacy screen**: hide content in the app switcher; optional screenshot blocking on sensitive screens.
- **Hide amounts** toggle.
- **Session**: Supabase session stored encrypted (AES key in `expo-secure-store`, ciphertext in regular storage), because SecureStore has size limits that sessions can exceed.
- **Local database encryption**: enable SQLCipher (supported by `expo-sqlite` through its config plugin — verify for the SDK in use); the key is generated per user and stored in `expo-secure-store`.
- Store only the **last 4 digits** of account/card numbers.
- Receipts stored in the app's private directory; EXIF stripped.
- No secrets in the app: only the Supabase URL and publishable/anon key (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Never the service-role/secret key or AI keys.

## 21.2 Server

- RLS on every table (§28), composite tenant foreign keys, and write access only through RPCs.
- `SECURITY DEFINER` functions set `search_path = ''`, derive the user from `auth.uid()`, and never trust a `user_id` sent by the client.
- Views use `security_invoker = true`.
- Private Storage bucket; paths `{user_id}/{receipt_id}.jpg`; short-lived signed URLs.
- Account deletion runs in an Edge Function (service role, server-side only).
- Auth rate limits left at Supabase defaults; AI Edge Function has its own quota.

## 21.3 Logging

- Sentry with PII scrubbing: no amounts, payees, notes, message bodies, or emails in events or breadcrumbs.
- No `console.log` of financial data in production builds.

---

# 22. Performance

- Transaction list: keyset pagination on `(occurred_on DESC, id DESC)` + FlashList.
- SQLite indexes (§25.3) for every list and aggregate query.
- Aggregates computed in SQL, not by loading rows into JS.
- Memoize derived UI values; avoid re-rendering lists on unrelated state changes.
- Charts receive pre-bucketed data (≤ ~100 points).
- Sync runs off the render path; large pulls are applied in batches inside transactions.
- Targets (§37.3).

---

# 23. Error, Empty, Loading, Offline States

Every screen handles:

```text
Loading     (skeletons, brief)
Empty       ("No transactions yet — add your first expense or income")
Error       (retry action, never a blank white screen)
Populated
Offline     (banner only; everything still works)
```

Sync problems are never modal. They appear in the SyncStatusIndicator and the Sync settings screen.

---

# 24. Internationalization & Formatting

- All strings in `src/i18n/`; no literal user-facing strings in components.
- Money via `formatMoney` only; dates via a shared `formatDate` using the user's locale and timezone.
- RTL-safe styles (`start`/`end`), tested once with forced RTL before adding Urdu.
- Number grouping: standard (`50,000`); lakh/crore grouping can be a later display option.

---

# 25. Local Database (SQLite)

## 25.1 Conventions

- Tables and columns mirror the server schema (§26) with identical names.
- IDs: UUID text, generated on the device (v7; deterministic v5 where noted).
- Amounts: `INTEGER` minor units.
- Dates: `occurred_on` as `YYYY-MM-DD` text (the user's local calendar date); timestamps as ISO-8601 UTC text.
- Every synced table has the sync columns:

```text
created_at   updated_at   deleted_at (tombstone)   version (integer)
```

- A database file per signed-in user: `finance_<user_id>.db` (Phase 2). In Phase 1 a single `finance_dev.db`.

## 25.2 Local-only tables

```text
outbox            id, entity, record_id, op (upsert|delete), payload (json),
                  base_version, created_at, attempts, last_error, status
sync_state        key/value: last_pull_cursor, last_sync_at, schema_version
sync_conflicts    id, entity, record_id, local_payload, server_payload, resolved_at
capture_drafts    raw text + parsed fields (never synced)
file_uploads      id, receipt_id, local_uri, status, attempts
```

## 25.3 Indexes (minimum)

```text
transactions(user_id, occurred_on DESC, id DESC) where deleted_at is null
transaction_entries(transaction_id)
transaction_entries(account_id)
transaction_entries(category_id)
transactions(payee)                -- search
recurring_occurrences(rule_id, due_on)
outbox(status, created_at)
```

## 25.4 Timezone

- `profiles.timezone` (default `Asia/Karachi`).
- `occurred_on` is the user's local date and is what all periods group by.
- `occurred_at` (optional exact instant) comes from SMS timestamps or the device clock.

---

# 26. Server Database Schema (Postgres)

## 26.1 Conventions

- UUID primary keys, **supplied by the client**.
- `user_id uuid not null` on **every** user-owned table, including child tables.
- Parent tables have `unique (id, user_id)`; child tables use **composite foreign keys** `(parent_id, user_id) references parent (id, user_id)`, making cross-user references impossible.
- Money: `bigint` + `currency char(3)`.
- Timestamps: `timestamptz`; calendar dates: `date`.
- Sync columns on every synced table: `created_at`, `updated_at`, `deleted_at`, `version int not null default 1`, `server_seq bigint not null` (set by trigger from a global sequence on every insert/update — used for delta pulls).
- Check constraints for enums, positive targets, and simple invariants; complex ledger invariants are checked in `sync_push`.
- Every change goes through a migration in `supabase/migrations/`. Never edit the production schema in the dashboard.
- Generated types: `supabase gen types typescript` committed and checked in CI.

## 26.2 Tables

```text
profiles
  id (= auth.users.id), display_name, base_currency, timezone, locale, avatar_path

user_settings
  user_id (pk), settings jsonb           -- theme, notification prefs, capture toggles

accounts
  id, user_id, name, type, class (asset|liability), currency, institution,
  last4, credit_limit_minor, is_archived, sort_order

categories
  id, user_id, parent_id (self, nullable), kind (expense|income|system),
  name, icon, color, sort_order, is_archived

transactions
  id, user_id, kind, status (pending|cleared|void), occurred_on, occurred_at,
  payee, notes, source (manual|sms|paste|ocr|recurring|import),
  source_fingerprint, refund_of_id, recurring_occurrence_id

transaction_entries
  id, user_id, transaction_id, account_id, category_id (nullable),
  amount_minor, currency, base_amount_minor, fx_rate (nullable, for later)

tags
  id, user_id, name
transaction_tags
  id, user_id, transaction_id, tag_id

budgets
  id, user_id, name, period (monthly|weekly|custom), start_on, end_on,
  amount_minor, currency, rollover, alert_thresholds int[]
budget_categories
  id, user_id, budget_id, category_id

recurring_rules
  id, user_id, name, template jsonb, frequency, interval, anchor jsonb,
  start_on, end_on, is_bill, reminder_days_before, auto_post, is_paused
recurring_occurrences
  id (deterministic), user_id, rule_id, due_on, status (upcoming|posted|skipped),
  transaction_id
  unique (rule_id, due_on)

goals
  id, user_id, name, target_minor, currency, target_on, mode (linked_account|contributions),
  linked_account_id, notes
goal_contributions
  id, user_id, goal_id, amount_minor, occurred_on, transaction_id (nullable)

holdings
  id, user_id, kind, name, unit, currency, notes
holding_lots
  id, user_id, holding_id, occurred_on, quantity numeric, cost_minor, transaction_id
holding_valuations
  id, user_id, holding_id, valued_on, value_minor, source (manual|feed)

net_worth_snapshots
  id (deterministic), user_id, snapshot_on, assets_minor, liabilities_minor,
  net_minor, breakdown jsonb
  unique (user_id, snapshot_on)

contacts
  id, user_id, name, phone

committees
  id, user_id, account_id, name, role (member|organizer), contribution_minor,
  currency, frequency, member_count, start_on, payout_order (fixed), status
committee_members
  id, user_id, committee_id, contact_id (null = me), payout_turn
committee_rounds
  id, user_id, committee_id, round_no, due_on, recipient_member_id,
  payout_transaction_id
committee_payments
  id, user_id, committee_id, round_id, member_id, amount_minor, paid_on,
  status (paid|pending|late), transaction_id (nullable)

payee_rules
  id, user_id, match_type (contains|starts_with|regex), pattern,
  category_id, payee_name, priority

receipts
  id, user_id, transaction_id, storage_path, mime, size_bytes, ocr jsonb

capture_fingerprints
  id, user_id, fingerprint, transaction_id        -- dedupe across devices; no raw text

processed_mutations
  mutation_id (pk), user_id, processed_at         -- sync idempotency; pruned after 30 days
```

Dropped from v1 plan: `account_types` (enum instead), `subcategories` (single tree), `liabilities` (liability accounts), `assets` (split into accounts + holdings), `bills` (recurring rules), `parsed_messages` (raw text never leaves device), `notifications` (local), `ai_insights` (computed on the fly), `message_sources` / `parser_rules` (versioned JSON in the app; user rules are `payee_rules`).

---

# 27. Sync Design

## 27.1 Overview

```text
Local write → SQLite transaction (rows + outbox entry)
                     ↓ (when online, debounced)
              sync_push(batch)  ──► Postgres applies atomically, returns results
                     ↓
              sync_pull(cursor) ──► rows changed since cursor (all tables, this user)
                     ↓
              apply to SQLite in a transaction, update cursor
```

Data is single-owner (no sharing between users), so conflicts only happen between the **same user's devices** — rare and simple to handle.

## 27.2 Units of sync

- Most entities sync row by row.
- A **transaction aggregate** (header + all its entries + tags) syncs as **one unit**, so the server can validate ledger invariants and apply it atomically.

## 27.3 `sync_push(mutations jsonb)`

Each mutation:

```text
{ mutation_id, entity, op: 'upsert' | 'delete', record, base_version }
```

Server behavior, in one Postgres transaction per batch:

1. `user_id` is forced to `auth.uid()`; any client-sent `user_id` is ignored.
2. Skip mutations whose `mutation_id` is in `processed_mutations` (idempotent retries).
3. Validate the record (enums, amounts are integers, ledger invariants for transaction aggregates, referenced rows belong to this user — also enforced by composite FKs).
4. Conflict check: if the server row's `version` ≠ `base_version` → conflict (§27.5).
5. Apply; increment `version`; trigger sets `updated_at` and `server_seq`.
6. Return per-mutation results: `applied` (with new version) · `conflict` (with server record) · `rejected` (with reason).

Deletes are soft: set `deleted_at`.

## 27.4 `sync_pull(since bigint, limit int)`

- Returns rows for `auth.uid()` from all synced tables with `server_seq > since`, ordered by `server_seq`, plus the new cursor and `has_more`.
- Includes tombstones (`deleted_at` set) so deletions propagate.
- The client applies each page in one SQLite transaction and advances the cursor.
- Pulled rows that the device itself just pushed are applied idempotently (same version).

Known limitation: sequence values can commit slightly out of order under concurrent writes. With single-owner data this is rare; mitigated by a **Full resync** action and an automatic weekly consistency check (compare per-table row counts + checksums of `id, version` and re-pull on mismatch).

## 27.5 Conflicts

Policy: **last-writer-wins per record/aggregate by `updated_at`, and the loser is never silently lost.**

- If the local change is newer → client re-pushes with the server's version as base.
- If the server change is newer → server version is applied locally.
- In both cases the losing version is stored in `sync_conflicts` and the Sync screen shows "1 change was overwritten — review". The user can restore the losing version (which becomes a new edit).

## 27.6 When sync runs

```text
App start (after unlock)
App returns to foreground
Connectivity regained (NetInfo)
After local writes (debounced ~2 s)
"Sync now" button
Optional: periodic background task when the OS allows
```

Retries use exponential backoff with jitter. Rejected mutations stay in the outbox marked `needs_attention` and are listed on the Sync screen with the reason (never dropped silently).

## 27.7 Files (receipts, avatar)

- Saved locally first; a `file_uploads` queue uploads to Storage when online (Wi-Fi-only option).
- The `receipts` row syncs normally; `storage_path` is set after upload.
- Other devices download receipts lazily when opened, via signed URLs, and cache them.

## 27.8 Auth and the local database

- App start with a stored session → open that user's local database immediately, **even offline or with an expired access token**. The token refreshes when online.
- If the refresh token is invalid when back online → ask the user to sign in again; keep the local database and outbox intact and resume sync after re-authentication **as the same user**.
- Sign-out: if the outbox has pending changes, warn and offer "Sync first". After sign-out, delete the local database file and its encryption key.
- First sign-in on a new device: full pull with a progress indicator.
- Phase 1 dev data is not migrated to real accounts (fresh start after Phase 2).

## 27.9 Schema evolution

- Local migrations (Drizzle) and server migrations are versioned together; each app build declares the server schema version it supports.
- Server changes are **additive first** (add columns/tables, keep old ones) so older app versions keep syncing.
- `sync_pull` ignores unknown columns on older clients; `sync_push` rejects clients below a minimum version with a clear "Please update" response.

## 27.10 Tombstone retention

Tombstones are kept for 180 days, then purged. A device that hasn't synced for longer than that is forced to do a full resync.

---

# 28. Supabase Setup

## 28.1 Projects

- **Development:** local Supabase via the CLI (Docker). All migrations and tests run here first.
- **Production:** one Supabase **Free** cloud project for the owner and friends.
- Optional: the second free project as staging, if needed.

## 28.2 Row Level Security

Every table in `public` has RLS enabled. Template:

```sql
alter table public.<table> enable row level security;

create policy "<table>_select_own" on public.<table>
  for select to authenticated
  using (user_id = (select auth.uid()));
```

- Clients get **select** only on domain tables. **Insert/update/delete are revoked from `authenticated`**; all writes go through `sync_push`.
- `(select auth.uid())` is used instead of `auth.uid()` for per-query evaluation (performance).
- Storage policies: a user can read/write only objects under `{auth.uid()}/`.
- CI check: fail if any `public` table has RLS disabled.
- Tests (`supabase/tests/`) for **every table**:
  - user A cannot select user B's rows,
  - user A cannot push a record referencing user B's account/category (composite FK rejects it),
  - user A cannot read B's receipts,
  - unauthenticated requests see nothing.

## 28.3 Auth

- Google Sign-In (native) + email/password.
- Email verification and password reset via deep links (app scheme configured in `app.json` and Supabase redirect URLs).
- Session persistence with encrypted storage (§21.1); auto-refresh started/stopped with app foreground/background, as recommended for React Native.
- Protected routes: everything except `(auth)` requires a session (or the Phase 1 dev user).

## 28.4 Email

Supabase's built-in email sender is heavily rate-limited and not intended for real users. Configure a **free-tier custom SMTP provider** (e.g. Resend or Brevo) before inviting friends, or rely on Google Sign-In.

## 28.5 Edge Functions

```text
delete-account     deletes storage objects, all rows, and the auth user
ai-proxy           Phase 5, optional
```

---

# 29. Testing Strategy

## 29.1 Unit (Jest) — from Phase 0

```text
money: parse, format, add, allocate, overflow guards
ledger: every kind in §6.2, invalid cases rejected, balance computation
budgets: periods, subcategory inclusion, refunds, rollover, transfers excluded
recurrence: month-end anchors, leap years, pauses, end dates, deterministic IDs
committees: schedule, payout order, balances
sync: outbox ordering, retry/backoff, conflict resolution, cursor handling
parser: golden corpus per provider (Phase 4)
```

## 29.2 Database (local Supabase in CI)

```text
RLS isolation per table
Composite FK cross-tenant rejection
sync_push: idempotency, version conflicts, invariant rejection, soft delete
sync_pull: cursor paging, tombstones, only own rows
delete-account: everything removed
```

## 29.3 End-to-end (Maestro), on Android

```text
First run → create account → add expense → add transfer with fee → balances correct
Offline: airplane mode → add/edit/delete → back online → synced
Two devices: edit same transaction offline on both → conflict recorded, nothing lost
Budget threshold → notification
Sign out with pending changes → warning
```

## 29.4 Manual checklist per release

Fresh install, empty states, dark mode, largest font size, slow network, Supabase paused (app still works), app lock, hide amounts.

---

# 30. Offline Behavior Summary

| Capability | Offline |
|---|---|
| View everything (transactions, balances, analytics, reports) | ✅ |
| Add / edit / delete anything | ✅ (queued) |
| Recurring occurrences & auto-post | ✅ |
| Local notifications | ✅ |
| SMS / paste parsing, OCR | ✅ |
| CSV/JSON export | ✅ |
| Receipt viewing | ✅ for receipts on this device; others after first download |
| Sign in on a new device | ❌ needs network |
| Sync across devices | ❌ resumes automatically |
| LLM features | ❌ "Available when online" |

---

# 31. Build, Distribution & Updates

- **Development build** (`expo-dev-client`) from day one; Expo Go is not supported (native modules).
- EAS build profiles: `development`, `preview` (internal APK for friends), `production` (later, stores).
- EAS's free plan has a monthly build quota; if it runs out, build locally (`eas build --local`).
- **Android only:** `eas.json` and `app.json` configure Android only; no iOS build profiles, credentials, or `ios/` native project.
- **Distribution:** internal-distribution APK link shared with friends. Friends enable "Install unknown apps" once for the browser/file manager.
- **Minimum Android version:** follow the Expo SDK's default `minSdkVersion`; test on at least one older, low-RAM device (common among friends) and one recent device.
- **Signing:** keep the same Android keystore (EAS-managed or backed up securely) forever — losing it means friends can't update without uninstalling and losing unsynced data.
- **OTA updates:** EAS Update on a `preview` channel; runtime version tied to native fingerprint so JS-only fixes ship instantly and native changes require a new APK.
- **Minimum version check:** on sync, the server can respond "update required" (§27.9).
- **Feature flags:** simple remote flags in `user_settings`/a `flags` table (e.g. disable SMS capture or AI without a release).

---

# 32. Observability

- Sentry (free tier) for crashes and errors, PII scrubbed (§21.3).
- Sync telemetry kept locally (last error, pending count) and shown on the Sync screen; optionally reported to Sentry as counts only.
- Supabase dashboard usage checked monthly (§33.3).

---

# 33. Operating on the Supabase Free Tier

## 33.1 Known constraints

| Constraint | Impact | Mitigation |
|---|---|---|
| No automatic backups | A bad migration or bug could lose server data | Nightly off-site backup (§33.2); devices also hold full local copies |
| Project pauses after ~1 week of low activity | Sync stops | Local-first app keeps working; scheduled keep-alive request; restore from dashboard if paused |
| 500 MB database | Enough for years of data for a small group | Monitor monthly |
| 1 GB file storage | ~3,000+ compressed receipts | Compress receipts (< 300 KB), optional "don't upload receipts" setting |
| 5 GB egress | Full resyncs and receipt downloads count | Delta sync; lazy receipt downloads |
| Built-in email restricted | Sign-up/reset emails may not arrive | Custom SMTP (§28.4) |

## 33.2 Backups (GitHub Actions, scheduled nightly)

```text
1. supabase db dump (schema + data) using a connection string stored as a GitHub secret
2. Encrypt the dump (e.g. age/GPG) — it contains friends' financial data
3. Store in a private location (private repo artifact or private cloud bucket), keep 30 days
4. The same workflow performs a lightweight API request (keep-alive)
```

- Storage objects (receipts) are not in the DB dump; a weekly job copies the bucket, or accept that receipts are best-effort in v1 (they also remain on the capturing device).
- **Restore drill** before inviting friends and then quarterly: restore the latest dump into local Supabase and verify row counts.
- Users can also export a JSON backup from the app at any time.

## 33.3 Monthly check

Database size, storage size, egress, auth users, Sentry errors, backup workflow success.

## 33.4 Upgrade triggers (move to Supabase Pro)

Upgrade when **any** of these become true:

- More than ~15–20 active users, or anyone outside the trusted friend group
- Database > 300 MB or storage > 700 MB
- A backup failure or pause caused real inconvenience
- Plans to publish on the Play Store / App Store (§38)

---

# 34. Data Ownership

- Export: CSV (transactions) and JSON (everything) from Settings, offline.
- Delete account: removes server data (Edge Function) and the local database on the device.
- Friends should know: the owner technically administers the database. Keep a short plain-language privacy note in the app ("Your data is stored on your device and synced to a private server run by <owner>. Raw SMS never leaves your phone.").

---

# 35. Cursor Working Rules

1. **One module per task.** Never implement the whole app in one prompt.
2. **Follow the phase order** (§36). Don't pull later-phase features forward.
3. **Money only through `src/domain/money.ts`.** No floats, no inline arithmetic on amounts.
4. **Ledger rules only through `src/domain/ledger.ts`.** Transfers are never expenses.
5. **UI never touches SQL or Supabase.** Screens → feature hooks → repositories.
6. **Every write is atomic** and appends an outbox entry in the same SQLite transaction.
7. **Every synced table** has `id` (client UUID), `user_id`, `created_at`, `updated_at`, `deleted_at`, `version` — locally and on the server.
8. **Every server migration** includes RLS, composite tenant FKs, and tests in the same task.
9. **Reuse components.** Don't duplicate buttons, inputs, rows, headers, sheets, empty states.
10. **No hardcoded colors, sizes, or strings.** Theme tokens and i18n only.
11. **Tests with the code** for domain logic, sync, and parsers.
12. **Offline is the default state.** Never block the UI on the network; never show modal network errors.
13. **Never hardcode secrets.** Only the Supabase URL and publishable/anon key in the app.
14. **Don't over-engineer.** Prefer the simplest solution that satisfies these rules.
15. **Preserve existing functionality.** Don't rewrite unrelated modules.
16. **Validate after every task:** typecheck, lint, tests, run on Android device/emulator, test main interactions, test offline.

---

# 36. Implementation Order

```text
PHASE 0 — Foundation & Contracts
01. Expo dev build, Expo Router, TS strict, ESLint/Prettier, path aliases
02. CI (typecheck, lint, tests)
03. Domain: money utils + tests
04. Domain: types, zod schemas, ledger rules + tests
05. Local DB: Drizzle schema (core tables + outbox), migrations, client
06. Repositories: accounts, categories, transactions (atomic + outbox)
07. Seed generator + dev menu
08. Theme (light/dark), i18n scaffolding, UI primitives
09. Navigation shell with placeholder screens reading repositories

PHASE 1 — Core UI (offline, local DB)
10. Accounts
11. Categories
12. Add/Edit transaction (expense, income, transfer + fee, split, refund)
13. Transactions list + detail + search/filters + undo delete
14. Home dashboard
15. Chart spike → ADR
16. Analytics
17. Budgets
18. Settings basics: theme, hide amounts, app lock, privacy screen, CSV export

PHASE 2 — Supabase, Auth, Sync
19. Local Supabase + server migrations (core tables, composite FKs, sync columns, server_seq)
20. RLS + RLS tests + CI RLS check
21. sync_push / sync_pull RPCs + tests
22. Auth (Google, email, custom SMTP, deep links, encrypted session)
23. Per-user encrypted local DB + sign-in/sign-out lifecycle
24. Client sync engine (push, pull, retry, conflicts, full resync)
25. Sync UI (status, pending, conflicts, sync now)
26. delete-account Edge Function
27. Cloud Free project, nightly backup + keep-alive workflow, restore drill
28. Sentry, EAS Update, preview APK

── MILESTONE: MVP for friends ──

PHASE 3 — Planning
29. Recurring rules + occurrences + bills views
30. Local notifications + preferences
31. Goals
32. Committees (committee accounts, member/organizer)
33. Holdings + valuations
34. Net worth + snapshots
35. Reports + JSON backup export

PHASE 4 — Smart Capture
36. Capture drafts + paste/share-to-app parsing + golden corpus
37. Payee rules + "always categorize" learning
38. Android SMS native module (receiver + inbox scan) + disclosure screens
39. Receipt capture, compression, OCR, upload queue

PHASE 5 — Insights
40. Deterministic insights + unusual spending
41. Optional: ai-proxy Edge Function, opt-in, quota, aggregates-only
42. Optional: assistant with tool calling over local query functions

PHASE 6 — Hardening
43. Performance pass with 20k transactions
44. Security + RLS audit
45. Restore drill + backup review
46. Accessibility pass (font scaling, screen reader, contrast)
47. Polish, bug bash with friends
```

---

# 37. Definition of Done

## 37.1 Every feature

```text
[ ] UI implemented with design-system components
[ ] Navigation reachable
[ ] Reads/writes via repositories; writes atomic + outbox
[ ] Loading / empty / error / populated states
[ ] Works offline
[ ] Validation (zod + domain rules)
[ ] Accessibility labels; survives largest font size
[ ] Light and dark mode
[ ] Strings in i18n
[ ] Unit tests for any domain logic added
[ ] Typecheck, lint, tests pass
[ ] Runs on an Android device; main interactions tested
```

## 37.2 Features touching the server (Phase 2+)

```text
[ ] Migration committed (never dashboard edits)
[ ] Composite tenant FKs + constraints
[ ] RLS enabled + isolation tests
[ ] Included in sync_push / sync_pull + tests
[ ] Two-device sync verified
[ ] Generated types updated
```

## 37.3 Non-functional targets

| Area | Target |
|---|---|
| Correctness | Ledger tests 100% passing; balances identical across devices after sync |
| Offline | Every feature in §30 marked ✅ works in airplane mode |
| Performance | Cold start < 2.5 s (mid-range Android); 60 fps list scroll with 10k transactions; home < 500 ms |
| Sync | Changes appear on a second device within 30 s when both are online |
| Security | RLS on 100% of `public` tables; cross-user tests for every table |
| Data safety | Nightly encrypted backups; restore drill passed |
| Stability | Crash-free sessions ≥ 99.5% (Sentry) |
| Privacy | No raw SMS, full account numbers, or raw transactions leave the device |

---

# 38. Going Public Checklist (deferred)

Only needed when opening the app beyond the friend group:

```text
[ ] Supabase Pro (daily backups, no pausing); consider PITR
[ ] Separate staging project
[ ] Google Play: Permissions Declaration for SMS ("SMS-based money management"),
    prominent disclosure, demo video; keep SMS behind a flag in case of rejection
[ ] Play: closed testing period with testers (required for new personal developer accounts)
[ ] Play Data Safety form
[ ] Privacy policy + terms hosted at a public URL
[ ] Account deletion: in-app + public web URL (Google Play requirement)
[ ] Push notifications (server-side reminders) if needed
[ ] Product analytics (privacy-respecting, opt-out)
[ ] Support channel and incident runbook
[ ] Monetization/entitlements if any
```

---

# 39. Long-Term Ideas (prioritize by real demand)

```text
iOS version (no SMS reading on iOS — paste/share and Shortcuts automation instead;
    needs a paid Apple Developer account, Sign in with Apple if Google Sign-In is offered,
    and App Store privacy labels)
Multi-currency accounts + FX revaluation
Price feeds for gold / PSX / funds / crypto
CSV / bank statement / PDF statement import
Cash-flow forecasting and financial calendar
Subscription detection
Debt tracking + loan amortization schedules
Split expenses with friends / shared wallets
Family or multiple financial spaces
Committee draw/bid payout modes
Urdu (RTL)
Home-screen widgets
Encrypted end-to-end backups
```

---

# 40. Cursor Prompt Template

```text
Implement task <NN>: <TASK NAME> from IMPLEMENTATION_PLAN.md.

Constraints:
- Follow §35 Cursor Working Rules and the architecture in §4.
- Current phase: <PHASE>. Do not implement anything from later phases.
- Money via src/domain/money.ts; ledger rules via src/domain/ledger.ts.
- UI → feature hooks → repositories → SQLite. No Supabase calls from UI.
- Writes are atomic and append to the outbox.
- Reuse existing components and theme tokens; strings via i18n.
- Loading, empty, error, populated, and offline states.
- Add unit tests for any domain logic.
- Do not modify unrelated modules.

Before coding:
1. Read the relevant plan sections.
2. Inspect existing architecture, components, types, repositories.
3. List the files you will create/change.

After coding:
1. Run typecheck, lint, tests; fix issues you introduced.
2. Summarize files changed and functionality added.
3. List assumptions and anything intentionally deferred.
4. Tick the Definition of Done (§37) items that apply.
```

---

# 41. First Cursor Task

```text
Implement Phase 0, tasks 01–04 from IMPLEMENTATION_PLAN.md.

01. Create the Expo app (latest stable SDK), Android only (no iOS config or
    build profiles), with expo-dev-client, Expo Router,
    TypeScript strict, ESLint + Prettier, and path aliases (@/domain, @/features,
    @/components, @/db, @/data, @/theme, @/i18n).
02. Add a GitHub Actions workflow running typecheck, lint, and Jest tests.
03. Implement src/domain/money.ts per §5 (integer minor units, add/subtract/negate/
    sum/allocate/parseMoneyInput/formatMoney with sign, hide, and compact modes)
    with thorough unit tests (rounding, negatives, currency mismatch, parsing
    "2,500.50", "Rs. 1,000", invalid input).
04. Implement src/domain/types.ts, schemas.ts (zod), and ledger.ts
    (validateTransaction, computeBalance) per §6, with unit tests covering every
    transaction kind in §6.2 and the invalid cases (transfer to same account,
    transfer with category, split on multiple accounts, non-integer amounts,
    entries not netting to zero).

Do NOT build screens, the local database, or anything from Supabase yet.

Run typecheck, lint, and tests; fix all issues. Summarize files, decisions,
and anything deferred.
```

Do **not** ask Cursor to implement the entire application in one prompt.
