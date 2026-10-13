# Bills, schedules and billing runs (Steps 12–13)

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
