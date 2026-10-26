import { auditListQuery, formatDate, type AuditRow, type Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Card, Chip, Field, inputClass, PageHeader } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getAuditLog, getAuditOptions } from "@/lib/api/reports";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 30;
const FILTERS = ["userId", "entityType", "entityId", "action", "from", "to"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/audit">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.audit") };
}

/** JSON as indented text; record types and fields are the API's own names. */
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

/** The audit log (`audit.view`), newest first: who did what to which record, with what changed. Read-only. */
export default async function AuditPage({ params, searchParams }: PageProps<"/[locale]/dashboard/audit">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("audit");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = auditListQuery.safeParse({ ...Object.fromEntries(FILTERS.map((key) => [key, text(key)])), page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const [t, tNav, list, options] = await Promise.all([getTranslations("Audit"), getTranslations("Dashboard.nav"), getAuditLog(query), getAuditOptions()]);
  const filters = Object.fromEntries(FILTERS.flatMap((key) => (query[key] ? [[key, query[key]]] : []))) as Record<string, string>;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));

  const select = (id: string, name: (typeof FILTERS)[number], label: string, all: string, values: { value: string; label: string }[]) => (
    <Field label={label} htmlFor={id}>
      <select id={id} name={name} defaultValue={query[name] ?? ""} className={`${inputClass} sm:w-auto! max-w-[220px]`}>
        <option value="">{all}</option>
        {values.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const json = (label: string, value: unknown) =>
    value === null ? null : (
      <div className="grid min-w-0 gap-1">
        <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
        <pre className="max-h-[320px] overflow-auto rounded-[8px] bg-surface-2 p-2.5 font-mono text-[12px] leading-snug whitespace-pre-wrap break-words">{pretty(value)}</pre>
      </div>
    );

  return (
    <>
      <PageHeader title={tNav("audit")} sub={t("sub")} />

      <form method="get" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        {query.entityId ? <input type="hidden" name="entityId" value={query.entityId} /> : null}
        {select("audit-user", "userId", t("user"), t("allUsers"), options.users.map((user) => ({ value: user.id, label: user.name })))}
        {select("audit-type", "entityType", t("entityType"), t("allTypes"), options.entityTypes.map((type) => ({ value: type, label: type })))}
        {select("audit-action", "action", t("action"), t("allActions"), options.actions.map((action) => ({ value: action, label: action })))}
        <Field label={t("from")} htmlFor="audit-from">
          <input id="audit-from" type="date" name="from" defaultValue={query.from ?? ""} className={`${inputClass} sm:w-auto!`} />
        </Field>
        <Field label={t("to")} htmlFor="audit-to">
          <input id="audit-to" type="date" name="to" defaultValue={query.to ?? ""} className={`${inputClass} sm:w-auto!`} />
        </Field>
        <Button type="submit" variant="outline">
          {t("show")}
        </Button>
        {Object.keys(filters).length ? (
          <Link href="/dashboard/audit" className="py-2 text-[13.5px] font-semibold text-primary">
            {t("clear")}
          </Link>
        ) : null}
      </form>

      <p className="num mb-2.5 text-[13.5px] text-muted-foreground">{t("count", { count: list.total })}</p>
      {list.items.length === 0 ? (
        <Card className="text-muted-foreground">{t("empty")}</Card>
      ) : (
        <ol className="grid gap-2.5">
          {list.items.map((row: AuditRow) => (
            <li key={row.id}>
              <Card className="grid gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                  <span className="num text-muted-foreground">{formatDate(row.at, locale, "stamp")}</span>
                  <b>{row.user?.name ?? t("system")}</b>
                  <Chip tone="info" plain>
                    <span className="font-mono">{row.action}</span>
                  </Chip>
                  <span className="font-mono text-[12.5px]">{row.entityType}</span>
                  {row.entityId && row.entityId !== query.entityId ? (
                    <Link href={{ pathname: "/dashboard/audit", query: { entityId: row.entityId } }} className="text-[12.5px] font-semibold text-primary">
                      {t("history")}
                    </Link>
                  ) : null}
                  {row.ip ? <span className="text-[12px] text-muted-foreground">{t("ip", { ip: row.ip })}</span> : null}
                </div>
                {row.before !== null || row.after !== null ? (
                  <details>
                    <summary className="cursor-pointer text-[13px] font-semibold text-primary">{row.before !== null ? `${t("before")} / ${t("after")}` : t("after")}</summary>
                    <div className="mt-2 grid gap-2.5 min-[900px]:grid-cols-2">
                      {json(t("before"), row.before)}
                      {json(t("after"), row.after)}
                    </div>
                  </details>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">{t("noDetails")}</p>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/audit", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
