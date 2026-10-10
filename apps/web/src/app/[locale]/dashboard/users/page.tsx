import { canAnywhere, formatDate, localDigits, pick, USER_STATUSES, userListQuery, type Locale, type UserSummary } from "@s57/shared";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { UserStatusChip } from "@/components/admin/status-chip";
import { Avatar, Chip, DataTable, inputClass, PageHeader, SearchInput, type Column } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUserFormOptions, getUsers } from "@/lib/api/admin";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 20;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/users">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.users") };
}

/** Users who can log in: search by name or phone, filter by status and role. */
export default async function UsersPage({ params, searchParams }: PageProps<"/[locale]/dashboard/users">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("users");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = userListQuery.safeParse({
    q: typeof search["q"] === "string" && search["q"].trim() ? search["q"] : undefined,
    status: search["status"] || undefined,
    roleId: search["roleId"] || undefined,
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tStatus, tDash, common, list, options] = await Promise.all([
    getTranslations("Admin.users"),
    getTranslations("Admin.status"),
    getTranslations("Dashboard"),
    getTranslations("Common"),
    getUsers(query),
    getUserFormOptions(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const page = query.page;
  const pageHref = (target: number) => ({
    pathname: "/dashboard/users" as const,
    query: {
      ...(query.q ? { q: query.q } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(target > 1 ? { page: String(target) } : {}),
    },
  });

  const columns: Column<UserSummary>[] = [
    {
      key: "name",
      header: t("name"),
      cell: (user) => (
        <Link href={`/dashboard/users/${user.id}`} className="flex items-center gap-2.5 font-semibold text-fg">
          <Avatar name={user.name ?? user.phone} />
          {user.name ? pick(user.name, user.nameEn, locale) : localDigits(user.phone, locale)}
        </Link>
      ),
    },
    { key: "phone", header: t("phone"), cell: (user) => <span className="num">{localDigits(user.phone, locale)}</span> },
    {
      key: "roles",
      header: t("roles"),
      cell: (user) =>
        user.roles.length === 0 ? (
          <span className="text-muted-foreground">{t("noRoles")}</span>
        ) : (
          <span className="inline-flex flex-wrap gap-1.5 whitespace-normal">
            {user.roles.map((role) => (
              <Chip key={`${role.roleId}:${role.scopeLocationId}`} tone={role.isSystem ? "acc" : "neutral"} plain>
                {role.scopeName ? `${role.roleName} · ${role.scopeName}` : role.roleName}
              </Chip>
            ))}
          </span>
        ),
    },
    { key: "status", header: t("status"), cell: (user) => <UserStatusChip status={user.status} locked={user.lockedUntil !== null} /> },
    {
      key: "lastLogin",
      header: t("lastLogin"),
      cell: (user) => (user.lastLoginAt ? formatDate(user.lastLoginAt, locale, "short") : t("never")),
    },
  ];

  return (
    <>
      <PageHeader
        title={tDash("nav.users")}
        sub={t("sub")}
        actions={
          canAnywhere(me.access, "users", "create") ? (
            <Link href="/dashboard/users/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("status")} className={`${inputClass} w-auto`}>
          <option value="">{t("allStatuses")}</option>
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tStatus(status)}
            </option>
          ))}
        </select>
        <select name="roleId" defaultValue={query.roleId ?? ""} aria-label={t("roles")} className={`${inputClass} w-auto max-w-[220px]`}>
          <option value="">{t("allRoles")}</option>
          {options.roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
      </form>

      <DataTable columns={columns} rows={list.items} rowKey={(user) => user.id} caption={tDash("nav.users")} empty={t("empty")} />

      {pages > 1 ? (
        <nav
          aria-label={common("pageOf", { page: localDigits(page, locale), pages: localDigits(pages, locale) })}
          className="mt-5 flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline" })} rel="prev">
              <ChevronLeft aria-hidden />
              {common("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {common("pageOf", { page: localDigits(page, locale), pages: localDigits(pages, locale) })}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline" })} rel="next">
              {common("next")}
              <ChevronRight aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
