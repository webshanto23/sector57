import { canAnywhere, type Access, type PermissionModule, type ReportKey } from "@s57/shared";

/** The modules behind each report: any one of them shows it (the day book shows a section per module). */
const MODULES: Record<ReportKey, PermissionModule[]> = {
  "day-book": ["payments", "donations", "expenses", "ledger"],
  collection: ["billing"],
  arrears: ["billing"],
  income: ["ledger"],
};

/** May the user open this report? Only hides links and pages; the API checks every request. */
export const canSeeReport = (access: Access, report: ReportKey): boolean => MODULES[report].some((module) => canAnywhere(access, module));

/** May the user download this report's CSV (`view` and `export` on a module behind it)? */
export const canExportReport = (access: Access, report: ReportKey): boolean =>
  MODULES[report].some((module) => canAnywhere(access, module) && canAnywhere(access, module, "export"));
