import { formatDate, pick, type CertificateRow, type CertificateStatus, type Locale } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, DataTable, type Column, type Tone } from "@/components/kit";
import { Link } from "@/i18n/navigation";

const STATUS_TONES: Record<CertificateStatus, Tone> = { draft: "warn", issued: "good", void: "bad" };

export function CertificateStatusChip({ status }: { status: CertificateStatus }) {
  const t = useTranslations("Certificates.status");
  return <Chip tone={STATUS_TONES[status]}>{t(status)}</Chip>;
}

/** A column a host page already shows and can leave out: the unit (on a unit page) or the person (on a person's). */
type Hidden = "unit" | "person";

/** Certificates as a table (cards on phones): number and type, unit, person, status and date. */
export function CertificatesTable({
  rows,
  locale,
  empty,
  hide = [],
  personLinks = false,
}: {
  rows: CertificateRow[];
  locale: Locale;
  empty: string;
  hide?: Hidden[];
  /** Link names to the person's page (for those who may see members). */
  personLinks?: boolean;
}) {
  const t = useTranslations("Certificates");
  const columns: Column<CertificateRow>[] = [
    {
      key: "number",
      header: t("col.number"),
      cell: (row) => (
        <Link href={`/dashboard/certificates/${row.id}`} className="grid font-semibold text-fg">
          <span className="num">{row.certNo ?? t("draftNo")}</span>
          <span className="text-[12.5px] font-normal text-muted-foreground">
            {t(`type.${row.type}`)}
            {row.purpose ? ` · ${row.purpose}` : ""}
          </span>
        </Link>
      ),
    },
    { key: "unit", header: t("col.unit"), cell: (row) => [...row.place.address, row.place.name].join(", ") },
    {
      key: "person",
      header: t("col.person"),
      cell: (row) =>
        personLinks ? (
          <Link href={`/dashboard/members/${row.person.id}`} className="text-fg">
            {pick(row.person.name, row.person.nameEn, locale)}
          </Link>
        ) : (
          pick(row.person.name, row.person.nameEn, locale)
        ),
    },
    { key: "status", header: t("col.status"), cell: (row) => <CertificateStatusChip status={row.status} /> },
    {
      key: "date",
      header: t("col.date"),
      cell: (row) => <span className="num">{formatDate(row.issuedAt ?? row.createdAt, locale, "short")}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns.filter((column) => !hide.includes(column.key as Hidden))}
      rows={rows}
      rowKey={(row) => row.id}
      caption={t("title")}
      empty={empty}
    />
  );
}
