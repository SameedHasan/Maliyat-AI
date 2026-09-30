# Maliyat AI

Local-first personal finance tracker for Android (Expo SDK 57, React Native, SQLite + Drizzle).
Everything works offline; Supabase sync arrives in a later phase. See `IMPLEMENTATION_PLAN.md`.

## Requirements

- Node 22, JDK 17 and the Android SDK (or an EAS account) — the app needs a **development build**; Expo Go is not supported because of native modules (SQLite, crypto).

## Run

```bash
npm install
npm run android      # builds and installs the dev client on a device/emulator
npm start            # afterwards: start Metro for the installed dev client
```

In a dev build, **More → Developer → Reset & load demo data** fills the database with ~18 months of realistic PKR activity.

## Checks

```bash
npm run check        # typecheck + lint + format check + tests
npm run db:generate  # after editing src/db/schema — commit the generated migration
```

CI (`.github/workflows/ci.yml`) runs the same checks and fails if migrations are out of date.

## Layout

```text
src/app/               Expo Router routes (thin — they render feature screens)
src/features/          screens and feature components
src/components/ui/     design-system primitives (MoneyText is the only amount renderer)
src/domain/            pure TypeScript: money, ledger rules, zod schemas (no React/Expo)
src/db/                Drizzle schema, generated migrations, client, dev seed
src/data/              repositories (every write = domain rows + outbox row, atomically)
src/theme/, src/i18n/  light/dark tokens, strings (src/i18n/en.json)
```

Money is stored as integer minor units (paisa); balances are always derived from ledger entries.
