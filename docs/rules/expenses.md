# Expenses and budgets (Step 16)

Shared money rules are in `docs/rules/finance.md`.

- Move expenses only through `ExpensesService` (`src/expenses`); who may do what is `expenseActions` in shared. Another module that raises a request inside its own transaction uses `createIn` (work orders) and checks `expenses.create` itself. Payroll books already-approved, paid expenses with `bookPaidIn` and voids them with `voidBookedIn`; such an expense is never voided on its own (409 `expense_from_payroll`).
- The list is `ExpenseListService`, voucher files `ExpenseVouchersService`; paying and voiding write the ledger through `settleIn` / `reverseIn` (`expense-money.ts`), and selects and mappers are in `expense-rows.ts`.
- Paying takes `lockFinanceSetup`, refuses more than the fund holds in that account (409 `fund_insufficient`) and writes one `out` ledger row (`source_type = 'expense'`); a void writes the reversing `in` row.
- Expense vouchers are private files (`PrivateFilesService`, area `expenses`) served only through `GET /expenses/:id/vouchers/:documentId`.
- An expense is a record (date, fund, payment method, optional title, total) with one or more `expense_lines` (head, vendor, description, amount). Write lines only through `writeLines` and check them with `checkRefs` (`expense-lines.ts`); the database keeps the total equal to the sum of the lines (checked at commit) and freezes lines once rejected, paid or void. Anything per head or per vendor (budgets, reports, filters) reads `expense_lines`, never the record.
- The method on the record is the plan; paying records what was used in `paid_method`, and a cheque or wallet reference may wait until then.
