# Finance setup, ledger, reports and overview (Steps 11, 17, 18, 29)

Billing, payments, donations and expenses have their own files; this one holds the rules they all share.

## Money and ledger

- Money crosses the API as decimal strings (`moneySchema` in shared), is written as `Prisma.Decimal` and read with `toFixed(2)`; add it with the paisa helpers (`addMoney`), never JS numbers.
- `ledger_entries` is append-only (trigger, migration `06_finance_setup`): correct with a reversing row (`reverses_id`), never update or delete. Each row records its `account` (`cash` or `bank`).
- E2e tests that write ledger rows use a throwaway society (`createTestApp([], { DEFAULT_SOCIETY_SLUG })`), since only a society delete can remove them.
- Draw invoice, receipt and voucher numbers only with `NumberingService.next(tx, ...)` inside the transaction that saves the record.
- Society settings are typed keys (`SETTING_KEYS`); read separate funds with `SettingsService.separateFunds`. Charge type changes need a society-wide billing grant.
- Any money-out path takes `lockFinanceSetup` and checks the account's balance first (409 `fund_insufficient`).
- Every money entry records how it was paid (Step 31): `method` (`PAYMENT_METHODS`) and a reference, validated with `refineMethodRef` and stored through `storedMethod`, which also gives the ledger account (`accountOfMethod`: cash to cash, everything else to bank). Never take an account from the client on a money-in or money-out form; derive it from the method. A database check keeps method and account in step on `expenses` and `payroll_runs`.

## Transfers

- Move money between funds or accounts only through `TransfersService` (`src/ledger`); read a fund's balance per account with `fundBalances` (`src/finance/balances.ts`). `fund_transfers` rows are only ever voided (trigger, migration `12_fund_transfers`).
- Extra fields on an error (like a balance) go in `details`; the exception filter drops anything else.

## Reports

- Reports live in `src/reports`, read-only. Figures that must agree with the fund statements are built from `ledger_entries`, not from the source tables.
- CSV goes through `csvFile` (BOM, CRLF, formula text defused) on a `/csv` route behind the module's `export`.
- Area reports respect the caller's scope for the report's module (`billing.view` for collection and arrears, `units.view` for occupancy); a place is reachable when the caller holds the grant there or their area lies under it (404 otherwise). Use `AreaTree` and `inScope` from `reports/area-tree.ts`, never a copy.
- Records reports (Step 29, `RecordsReportsService` and `RecordsReportsController`): occupancy counts active units by the stored `units.occupancy`; members are scoped through `memberships.location_id` (a scoped caller never sees memberships without a place); the renter list for the police station needs `members.export` for the page itself, scopes on that grant, and answers 403 `thana_sharing_off` while the setting `share_renters_with_thana` is not `true`. It never carries the NID.
- A new report adds its key to `REPORT_KEYS` and its modules to `MODULES` in `apps/web/src/components/reports/access.ts` (list a report that is itself an export in `EXPORT_ONLY`).
- Long printed lists use the `print-a4` class (named page `a4` in `globals.css`).
- A report's A4 print goes through `ReportPrint` (`components/reports/report-print.tsx`, 2026-10-29): the society band, title and filter line, the body, signature lines and the "Printed … · Page x of y" footer, on the named page `a4` or `a4-landscape`. The day book prints on A4 portrait from `getBrand` (cashier, treasurer and general secretary sign), the income report too (treasurer, general secretary, president) and the members report (general secretary, president). Tables go through `PrintSection`: an empty section prints "None"; a voided row is struck through, marked void and not counted. Collection and occupancy have no print (Anis, 2026-10-29: screen and CSV are enough).
- Wide registers print on A4 landscape with the `print-a4-landscape` class (named page `a4-landscape`); the page footer goes in the `@bottom-left` margin box through a page rule the print component adds, because only CSS can count pages (`register-print.tsx`).
- Collection register (Step 33): a receipt splits over its bills' lines in line order after earlier unvoided receipts (tie-break received_at, id, as in the income report), one column per charge type plus donations; voided receipts are listed but never counted; donations need `donations.view` (CSV: `donations.export`) and drop out under a place filter. The split and totals are the pure rules in `contracts/collection-register.ts`; the screen and the print share `RegisterGrid`.

## Overview dashboard

- `GET /overview` (`src/overview`) returns one block per card, null without its grant; a new card adds a nullable block there and its sum limited with the card's grant scope. Results are cached per caller and grants for `OVERVIEW_CACHE_SECONDS` (e2e tests set it to `0`).
- Money charts use `chartScale` (shared) for their axis; amounts become numbers only for drawing.
