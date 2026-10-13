import { canAnywhere, type Access, type PermissionModule } from "@s57/shared";
import {
  Archive,
  ArrowRightLeft,
  Banknote,
  Bell,
  BookUser,
  Briefcase,
  Building2,
  ChartColumn,
  Coins,
  FilePen,
  FolderOpen,
  Globe,
  HandHeart,
  IdCard,
  House,
  Landmark,
  LayoutDashboard,
  Map,
  Megaphone,
  Receipt,
  Repeat,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** URL segment under /dashboard and the i18n key in `Dashboard.nav`. */
export type NavKey =
  | "overview"
  | "property"
  | "units"
  | "members"
  | "moves"
  | "directory"
  | "forms"
  | "billing"
  | "collect"
  | "recurring"
  | "donations"
  | "expenses"
  | "ledger"
  | "hrm"
  | "facilities"
  | "notices"
  | "documents"
  | "reports"
  | "roles"
  | "users"
  | "website"
  | "settings"
  | "audit";

export type NavItem = {
  key: NavKey;
  icon: LucideIcon;
  /** Shown when the user may `view` this module anywhere; null for the overview (everyone). */
  module: PermissionModule | null;
  /** Other modules whose `view` also shows the item (its page has a tab for each). */
  also?: PermissionModule[];
};
export type NavGroup =
  | { key: null; icon?: undefined; items: NavItem[] }
  | {
      key: "property" | "people" | "finance" | "operations" | "community" | "records" | "admin";
      /** Shown before the group name; kept apart from the item icons. */
      icon: LucideIcon;
      items: NavItem[];
    };

/**
 * The mockup's `DNAV`, in its order. Items whose module is not in the permission
 * catalogue yet (work orders, helpdesk, vehicles, events, voting, board,
 * certificates) are left out until that module exists.
 */
export const DASHBOARD_NAV: NavGroup[] = [
  { key: null, items: [{ key: "overview", icon: LayoutDashboard, module: null }] },
  {
    key: "property",
    icon: House,
    items: [
      { key: "property", icon: Map, module: "locations" },
      { key: "units", icon: Building2, module: "units" },
    ],
  },
  {
    key: "people",
    icon: Users,
    items: [
      { key: "members", icon: UserRound, module: "members" },
      { key: "moves", icon: ArrowRightLeft, module: "tenancies" },
      { key: "directory", icon: BookUser, module: "members" },
      { key: "forms", icon: FilePen, module: "forms" },
    ],
  },
  {
    key: "finance",
    icon: Coins,
    items: [
      { key: "billing", icon: Receipt, module: "billing" },
      { key: "collect", icon: Banknote, module: "payments" },
      { key: "recurring", icon: Repeat, module: "billing" },
      { key: "donations", icon: HandHeart, module: "donations" },
      { key: "expenses", icon: Wallet, module: "expenses", also: ["budgets"] },
      { key: "ledger", icon: Landmark, module: "ledger" },
    ],
  },
  {
    key: "operations",
    icon: Wrench,
    // The staff page has a tab for attendance, so a roster-only role still finds it.
    items: [
      { key: "hrm", icon: IdCard, module: "staff", also: ["attendance"] },
      { key: "facilities", icon: Warehouse, module: "facilities" },
    ],
  },
  { key: "community", icon: Megaphone, items: [{ key: "notices", icon: Bell, module: "notices" }] },
  {
    key: "records",
    icon: Archive,
    items: [
      { key: "documents", icon: FolderOpen, module: "documents" },
      // Each report needs its own module's view; the item shows with any of them.
      { key: "reports", icon: ChartColumn, module: "billing", also: ["payments", "donations", "expenses", "ledger"] },
    ],
  },
  {
    key: "admin",
    icon: Briefcase,
    items: [
      { key: "roles", icon: ShieldCheck, module: "roles" },
      { key: "users", icon: UserCog, module: "users" },
      { key: "website", icon: Globe, module: "site", also: ["committee", "gallery"] },
      { key: "settings", icon: Settings, module: "settings", also: ["ledger", "billing"] },
      { key: "audit", icon: ScrollText, module: "audit" },
    ],
  },
];

const allowed = (item: NavItem, access: Access) =>
  item.module === null || [item.module, ...(item.also ?? [])].some((module) => canAnywhere(access, module));

/** The nav keys this user may see, in order (empty groups dropped). Only hides links; the API checks every request. */
export function visibleNavKeys(access: Access): NavKey[] {
  return DASHBOARD_NAV.flatMap((group) => group.items.filter((item) => allowed(item, access)).map((item) => item.key));
}

/** The nav item for a `/dashboard/[section]` URL, if this user may open it (overview has its own route). */
export function sectionFor(key: string, access: Access): NavItem | undefined {
  const item = DASHBOARD_NAV.flatMap((group) => group.items).find((candidate) => candidate.key === key);
  return item && item.module !== null && allowed(item, access) ? item : undefined;
}
