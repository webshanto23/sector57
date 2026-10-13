import { pick, type Locale, type VehicleRow } from "@s57/shared";
import { useTranslations } from "next-intl";
import { Chip, DataTable, type Column } from "@/components/kit";
import { Link } from "@/i18n/navigation";
import { StickerCell } from "./vehicle-chips";

/** A column a host page already shows and can leave out: the unit (on a unit page) or the person (on a person's). */
type Hidden = "unit" | "person";

/** Vehicles as a table (cards on phones): number and kind, unit, person, latest sticker. */
export function VehiclesTable({
  rows,
  locale,
  empty,
  hide = [],
  personLinks = false,
}: {
  rows: VehicleRow[];
  locale: Locale;
  empty: string;
  hide?: Hidden[];
  /** Link names to the person's page (for those who may see members). */
  personLinks?: boolean;
}) {
  const t = useTranslations("Vehicles");
  const columns: Column<VehicleRow>[] = [
    {
      key: "regNo",
      header: t("col.regNo"),
      cell: (row) => (
        <Link href={`/dashboard/vehicles/${row.id}`} className="grid font-semibold text-fg">
          <span className="num">{row.regNo}</span>
          <span className="text-[12.5px] font-normal text-muted-foreground">
            {[t(`kind.${row.kind}`), row.make, row.colour].filter(Boolean).join(" · ")}
            {row.removedAt ? (
              <Chip tone="neutral" plain className="ms-1.5">
                {t("removed")}
              </Chip>
            ) : null}
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
    { key: "sticker", header: t("col.sticker"), cell: (row) => <StickerCell sticker={row.sticker} /> },
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
