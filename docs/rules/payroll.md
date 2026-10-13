# Payroll (Step 26)

Shared money rules are in `docs/rules/finance.md`; staff pay and attendance in `docs/rules/staff.md`.

- Payroll runs live in `src/payroll`: `PayrollService` reads, `PayrollDraftService` prepares, recalculates, edits payslips and approves, `PayrollPayService` pays and voids. Module `payroll` is society-wide. Each service writes its own audit rows (`entity_type = 'payroll_run'`) in the same transaction.
- One live run per society and month (partial unique index; 409 `payroll_exists`); a voided run stays for the record and makes room for a new one. No month after the current one (400 `future_month`).
- Pay rules are pure helpers in `contracts/payroll.ts` (`payslipFigures`, `stintInMonth`, `payslipNet`, `lineTotals`), on whole paisa, rounded half up:
  - monthly staff (permanent, contract): the salary × the stint's days in the month ÷ days in the month, less salary ÷ days in month per absent day and half that per half day. Leave, off and unmarked days are paid. The deduction never exceeds the base;
  - daily workers: the rate × (present days + half days at a half);
  - a blank rate pays nothing (the payslip page says so).
- A payslip copies the kind, rate and the month's counts, so it reads the same after the staff row or attendance changes. A refresh rewrites a draft's payslips but keeps each one's fund, note and lines (by staff row).
- A payslip is charged to a fund: the default fund unless separate funds is on and the draft says otherwise. Its net is checked in the database (`net = base − attendance_deduction + allowances − deductions`, never below zero; 400 `negative_net`, 409 `payslip_negative_net` on a refresh).
- Nobody approves a run they prepared (403 `cannot_approve_own`). Triggers keep payslips and lines unchanged once the run leaves draft, keep runs moving only forward (draft → approved → paid, any → void) and refuse deletes except a cascade (removing a whole society, or a draft payslip's lines with it).
- Paying (`payroll.edit` and `expenses.create`, else 403 `pay_needs_expenses`) takes `lockFinanceSetup` and books one paid expense per fund through `ExpensesService.bookPaidIn` under the expense head chosen at payment (the last one used is offered first): requested by the preparer, approved by the approver, paid by the caller. A short fund refuses the whole payment (409 `fund_insufficient`, nothing written). There is no payroll ledger source.
- Voiding (`payroll.approve`) a paid run also needs `expenses.approve` (403 `void_needs_expenses`) and voids its expenses through `ExpensesService.voidBookedIn`. An expense booked by a run can't be voided on its own (409 `expense_from_payroll`).
- The overview's approvals card lists drafts someone else prepared (for `payroll.approve`) and approved runs not yet paid (for `payroll.edit` with `expenses.create`), through `payrollWaiting`.
- Web: the Payroll tab at `/dashboard/hrm/payroll?month=` (last month by default; `src/lib/api/payroll.ts`, `components/payroll/`) and the payslip page `/dashboard/hrm/payroll/[id]/[payslipId]` with the line editor while a draft and the A5 print through `PrintSheet`.
- Not in v1: salary advances, tax and provident fund, bank transfer files, payslips by SMS or email.
