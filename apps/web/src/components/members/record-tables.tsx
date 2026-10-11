import { formatTaka, localDigits, type Locale, type Occupant, type Ownership, type Tenancy } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Card, Chip, DataTable, type Column } from "@/components/kit";
import { DateRange, PlaceLink, TenancyStatusChip } from "./labels";

type Open = { units: boolean; locations: boolean };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="grid content-start gap-3">
      <h2 className="text-[15px]">{title}</h2>
      {children}
    </Card>
  );
}

const placeOpen = (open: Open, isUnit: boolean) => (isUnit ? open.units : open.locations);

/** What someone owns, now and before, inside the caller's area. */
export async function OwnershipTable({ rows, locale, open }: { rows: Ownership[]; locale: Locale; open: Open }) {
  const t = await getTranslations("Members");
  const columns: Column<Ownership>[] = [
    { key: "place", header: t("col.place"), cell: (row) => <PlaceLink place={row.place} open={placeOpen(open, row.place.isUnit)} /> },
    { key: "share", header: t("share"), numeric: true, cell: (row) => localDigits(t("sharePercent", { share: row.sharePercent }), locale) },
    {
      key: "dates",
      header: t("from"),
      cell: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <DateRange start={row.startDate} end={row.endDate} />
          {row.endDate ? null : <Chip tone="good">{t("owner")}</Chip>}
        </span>
      ),
    },
  ];
  return (
    <Section title={t("ownerships")}>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("ownerships")} empty={t("noneInArea")} />
    </Section>
  );
}

/** What someone (or an organisation) rents, now and before. */
export async function TenancyTable({ rows, locale, open }: { rows: Tenancy[]; locale: Locale; open: Open }) {
  const t = await getTranslations("Members");
  const columns: Column<Tenancy>[] = [
    { key: "place", header: t("col.place"), cell: (row) => <PlaceLink place={row.place} open={placeOpen(open, true)} /> },
    { key: "type", header: t("col.role"), cell: (row) => t(`renterRole.${row.renterType}`) },
    { key: "dates", header: t("from"), cell: (row) => <DateRange start={row.startDate} end={row.endDate} /> },
    { key: "rent", header: t("monthlyRent"), numeric: true, cell: (row) => (row.monthlyRent ? formatTaka(row.monthlyRent, locale) : "—") },
    { key: "status", header: t("statusLabel"), cell: (row) => <TenancyStatusChip status={row.status} /> },
  ];
  return (
    <Section title={t("tenancies")}>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("tenancies")} empty={t("noneInArea")} />
    </Section>
  );
}

/** The households someone lives or lived in. */
export async function HouseholdTable({ rows, open }: { rows: Occupant[]; open: Open }) {
  const t = await getTranslations("Members");
  const columns: Column<Occupant>[] = [
    { key: "place", header: t("col.place"), cell: (row) => <PlaceLink place={row.place} open={placeOpen(open, true)} /> },
    {
      key: "relation",
      header: t("people.relationLabel"),
      cell: (row) => t(row.tenancyId ? "household.renter" : "household.owner", { relation: t(`relation.${row.relation}`) }),
    },
    { key: "dates", header: t("from"), cell: (row) => <DateRange start={row.startDate} end={row.endDate} /> },
  ];
  return (
    <Section title={t("households")}>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={t("households")} empty={t("noneInArea")} />
    </Section>
  );
}
