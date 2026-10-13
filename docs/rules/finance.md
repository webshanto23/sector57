# Finance setup, ledger, reports and overview (Steps 11, 17, 18)

Billing, payments, donations and expenses have their own files; this one holds the rules they all share.

## Money and ledger

- Money crosses the API as decimal strings (`moneySchema` in shared), is written as `Prisma.Decimal` and read with `toFixed(2)`; add it with the paisa helpers (`addMoney`), never JS numbers.
- `ledger_entries` is append-only (trigger, migration `6_finance_setup`): correct with a reversing row (`reverses_id`), never update or delete. Each row records its `account` (`cash` or `bank`).
- E2e tests that write ledger rows use a throwaway society (`createTestApp([], { DEFAULT_SOCIETY_SLUG })`), since only a society delete can remove them.
- Draw invoice, receipt and voucher numbers only with `NumberingService.next(tx, ...)` inside the transaction that saves the record.
- Society settings are typed keys (`SETTING_KEYS`); read separate funds with `SettingsService.separateFunds`. Charge type changes need a society-wide billing grant.
- Any money-out path takes `lockFinanceSetup` and checks the account's balance first (409 `fund_insufficient`).

## Transfers

- Move money between funds or accounts only through `TransfersService` (`src/ledger`); read a fund's balance per account with `fundBalances` (`src/finance/balances.ts`). `fund_transfers` rows are only ever voided (trigger, migration `12_fund_transfers`).
- Extra fields on an error (like a balance) go in `details`; the exception filter drops anything else.

## Reports

- Reports live in `src/reports`, read-only. Figures that must agree with the fund statements are built from `ledger_entries`, not from the source tables.
- CSV goes through `csvFile` (BOM, CRLF, formula text defused) on a `/csv` route behind the module's `export`.
- Area reports respect the caller's `billing.view` scope; a place is reachable when the caller holds the grant there or their area lies under it (404 otherwise).
- Long printed lists use the `print-a4` class (named page `a4` in `globals.css`).

## Overview dashboard

- `GET /overview` (`src/overview`) returns one block per card, null without its grant; a new card adds a nullable block there and its sum limited with the card's grant scope. Results are cached per caller and grants for `OVERVIEW_CACHE_SECONDS` (e2e tests set it to `0`).
- Money charts use `chartScale` (shared) for their axis; amounts become numbers only for drawing.
