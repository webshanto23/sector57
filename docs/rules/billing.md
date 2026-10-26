# Bills, schedules and billing runs (Steps 12–13, 27)

Shared money rules are in `docs/rules/finance.md`.

## Bills

- Make bills only through `InvoicesService` (`src/billing`); who a unit's bill goes to is `BillToService.choose` (rule `pickBillTo` in shared). A bill keeps `bill_to_snapshot`, `fund_id` (one fund per bill) and `kind` (`regular`, `opening`, `membership`); lines carry `position`.
- Bills are area-scoped through their unit's path; a membership bill has no unit and needs a society-wide billing grant. `overdue` is derived, never stored.
- Lines never change after issue. A bill is voided (reason, who, when) only while nothing is paid; anything that changes `paid` locks the bill row `FOR UPDATE` first.

## Schedules and runs

- Schedules (`SchedulesService`) and runs (`BillingRunsService`) live in `src/billing`; both take `lockBillingRun(tx, societyId)` first. Period maths and area rates are the pure helpers in shared `contracts/schedules.ts` (`duePeriods`, `nextRunAfter`, `resumeFrom`, `rateFor`).
- A run writes everything in one transaction (bills via `createMany`, numbers via `NumberingService.reserve`).
- Inside a transaction, run queries one after another and avoid nested relation selects (they load in parallel on the one connection and trip pg's deprecation warning).
- The nightly job (`BillingRunsJob`, 02:00 Dhaka) bills `auto` schedules for every society and is off when `NODE_ENV=test`.

## Several units at once (Step 27)

- `InvoiceBatchService` (`src/billing`) makes a batch through `InvoicesService.issueRegularIn` inside one transaction, so every bill keeps the single bill's checks, numbering and audit. All or none; an error carries the unit in `details.unitId`.
- A unit's lines are split into one bill per fund (`splitByFund` in shared); the check shows the split before anything is made.
- Earlier bills (not void) of the unit with the same charge type in an overlapping span only warn (`duplicateBills`; a bill with no period spans its issue month). Never block on them.
- Printing several bills goes through `GET /invoices/print` (at most `MAX_PRINT_BILLS`, view-checked per bill) and `BillSheet` inside one `PrintSheet`, each in a `.print-page` that starts a new page.
- **Print formats (Step 30).** The paper is chosen at print time, never hardcoded. Formats live in `contracts/print.ts`: `PRINT_FORMATS` (all papers), `PRINT_SUPPORT` (the papers each document type has a layout for; bills: `a4`, `a5`), and the setting `print_formats` (per document type: `default`, `offered`, and for bills the note, one point per line). `printFormatsOf` drops what a document no longer supports. The web picks with `usePrintFormat` (`components/print/print-format.tsx`): a pick on the page, else this device's last pick (local storage), else the default, each only while offered. A new paper or document type means a new layout plus its entry in `PRINT_SUPPORT`; thermal (80 mm) comes in Step 30b.
- **A4 bill** (`bill-a4.tsx`, named page `bill-a4` with margin 0): always one page; above `BILL_COMPACT_ABOVE` (10) lines the rows tighten and payment and notes share a box. Payable is the bill's own `due`; `otherDue` (the unit's other unpaid or part-paid bills, never this one or void ones) is only a note. Contacts (email, registration number, office hours) come from `receipt_header`; never put society text in code or i18n beyond generic fallbacks.
- `GET /billing/units` lists every unit in the caller's `billing.create` area (at most `MAX_BILLABLE_UNITS`, `truncated` past that) for the batch picker; it needs only the billing grant, not `locations`.
