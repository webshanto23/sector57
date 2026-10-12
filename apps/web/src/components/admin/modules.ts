import type { PermissionModule } from "@s57/shared";

/**
 * The permission matrix, in the sidebar's groups (labels in `Dashboard.groups`).
 * Every module of `PERMISSION_MODULES` appears exactly once (checked by the type below).
 */
export const MATRIX_GROUPS = [
  { key: "property", modules: ["locations", "units"] },
  { key: "people", modules: ["members", "ownerships", "tenancies", "forms"] },
  { key: "finance", modules: ["billing", "payments", "donations", "expenses", "budgets", "ledger"] },
  { key: "operations", modules: ["staff", "attendance"] },
  { key: "community", modules: ["notices", "committee", "gallery", "site"] },
  { key: "records", modules: ["documents"] },
  { key: "admin", modules: ["users", "roles", "settings", "audit"] },
] as const satisfies readonly { key: string; modules: readonly PermissionModule[] }[];

type Listed = (typeof MATRIX_GROUPS)[number]["modules"][number];
// Fails to compile when a module is added to the catalogue but not to the matrix.
const everyModuleListed: Exclude<PermissionModule, Listed> extends never ? true : never = true;
void everyModuleListed;
