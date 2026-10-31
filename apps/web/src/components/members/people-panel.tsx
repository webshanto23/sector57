"use client";

import {
  OCCUPANT_RELATIONS,
  OPEN_TENANCY_STATUSES,
  RENTER_TYPES,
  localDigits,
  type Locale,
  type LocationPeople,
  type Occupant,
  type OccupantRelation,
  type RenterType,
  type Tenancy,
} from "@s57/shared";
import { ArrowRightLeft, House, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useContext, useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Card, Chip, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { DateRange, PartyLink, TenancyStatusChip } from "./labels";
import { OwnersSection } from "./owners-section";
import { Block, Empty, FormActions, Past, rowClass } from "./people-blocks";
import { PastRenterSelect, pastRenters } from "./past-renter-select";
import { DateField, emptyParty, IdsRequired, PartyFields, partyBody, partyReady, RowActions, todayIso, type PartyValues } from "./party-fields";
import { emptyPerson, PersonFields, personBody } from "./person-fields";

type Submit = ReturnType<typeof useSubmit>;
type OpenStatus = (typeof OPEN_TENANCY_STATUSES)[number];

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

function AddTenancyForm({ unitId, past, submit, onDone }: { unitId: string; past: Tenancy[]; submit: Submit; onDone: () => void }) {
  const t = useTranslations("Members");
  const ids = useContext(IdsRequired);
  const [party, setParty] = useState<PartyValues>(emptyParty);
  const renters = pastRenters(past);
  const [picked, setPicked] = useState<(typeof renters)[number] | null>(null);
  const [values, setValues] = useState({
    renterType: "family" as RenterType,
    status: "active" as "pending" | "active",
    startDate: todayIso(),
    monthlyRent: "",
    policeFormSubmitted: false,
  });
  return (
    <form
      noValidate
      className="grid gap-3.5 rounded-[10px] border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const renter = picked ? ({ kind: "existing", party: { kind: picked.renter.kind, id: picked.renter.id } } as const) : partyBody(party);
        const done = await submit.run(() => api.POST("/tenancies", { body: { unitId, renter, ...values } }), t("people.added"));
        if (done) onDone();
      }}
    >
      {renters.length > 0 ? (
        <PastRenterSelect
          rows={renters}
          value={picked?.id ?? ""}
          onChange={(row) => {
            setPicked(row);
            if (row) setValues({ ...values, renterType: row.renterType, monthlyRent: row.monthlyRent ?? "" });
          }}
        />
      ) : null}
      {picked ? null : <PartyFields id="renter" values={party} onChange={setParty} />}
      {(picked ? picked.renter.kind : party.kind) === "person" ? <p className="text-[12.5px] text-muted-foreground">{t("people.renterIsResident")}</p> : null}
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <Field label={t("col.role")} htmlFor="renter-type">
          <select
            id="renter-type"
            className={inputClass}
            value={values.renterType}
            onChange={(e) => setValues({ ...values, renterType: e.target.value as RenterType })}
          >
            {RENTER_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`renterType.${type}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("statusLabel")} htmlFor="renter-status">
          <select
            id="renter-status"
            className={inputClass}
            value={values.status}
            onChange={(e) => setValues({ ...values, status: e.target.value as "pending" | "active" })}
          >
            {(["active", "pending"] as const).map((status) => (
              <option key={status} value={status}>
                {t(`tenancyStatus.${status}`)}
              </option>
            ))}
          </select>
        </Field>
        <DateField id="renter-start" label={t("people.startDate")} value={values.startDate} onChange={(startDate) => setValues({ ...values, startDate })} />
        <TextField
          id="renter-rent"
          label={t("monthlyRent")}
          hint={t("monthlyRentHint")}
          inputMode="decimal"
          value={values.monthlyRent}
          onChange={(e) => setValues({ ...values, monthlyRent: e.target.value })}
        />
      </div>
      <CheckField
        id="renter-police"
        label={t("policeForm")}
        checked={values.policeFormSubmitted}
        onChange={(e) => setValues({ ...values, policeFormSubmitted: e.target.checked })}
      />
      <FormActions busy={submit.busy} ready={(picked !== null || partyReady(party, ids)) && !!values.startDate} onCancel={onDone} />
    </form>
  );
}

function OpenTenancy({ row, can, submit }: { row: Tenancy; can: LocationPeople["can"]["tenancies"]; submit: Submit }) {
  const t = useTranslations("Members");
  const tMoves = useTranslations("Moves");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const patch = (body: { status?: OpenStatus; policeFormSubmitted?: boolean }) =>
    submit.run(() => api.PATCH("/tenancies/{id}", { params: { path: { id: row.id } }, body }));

  return (
    <div className={rowClass}>
      <div className="grid gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          {row.renter ? <PartyLink party={row.renter} /> : null}
          <span className="text-[12.5px] text-muted-foreground">{t(`renterRole.${row.renterType}`)}</span>
          <TenancyStatusChip status={row.status} />
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          <DateRange start={row.startDate} end={row.endDate} />
          {row.monthlyRent ? <span className="num"> · ৳{localDigits(row.monthlyRent, locale)}</span> : null}
          {row.renter?.phone ? <span className="num"> · {localDigits(row.renter.phone, locale)}</span> : null}
        </span>
        {row.openMove ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px]">
            <Chip tone="warn">{t(`people.moveUnderWay.${row.openMove.kind}`)}</Chip>
            <Link href={`/dashboard/moves/${row.openMove.id}`} className="font-semibold text-primary">
              {t("people.openMove")}
            </Link>
          </span>
        ) : can.edit && (row.status === "pending" || row.status === "active") ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={submit.busy}
              onClick={async () => {
                const kind = row.status === "pending" ? "move_in" : "move_out";
                const made = await submit.run(() => api.POST("/moves", { body: { tenancyId: row.id, kind } }), tMoves("startedNow"));
                if (made) router.push(`/dashboard/moves/${made.id}`);
              }}
            >
              <ArrowRightLeft aria-hidden />
              {t(row.status === "pending" ? "people.startMoveIn" : "people.startMoveOut")}
            </Button>
          </div>
        ) : null}
        {can.edit && !row.openMove ? (
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label={t("statusLabel")}
              className={`${inputClass} sm:w-auto!`}
              value={row.status}
              disabled={submit.busy}
              onChange={(e) => void patch({ status: e.target.value as OpenStatus })}
            >
              {OPEN_TENANCY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`tenancyStatus.${status}`)}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={row.policeFormSubmitted}
                disabled={submit.busy}
                onChange={(e) => void patch({ policeFormSubmitted: e.target.checked })}
              />
              {t("policeForm")}
            </label>
          </div>
        ) : null}
      </div>
      <RowActions
        canEnd={can.edit}
        canDelete={can.delete}
        disabled={submit.busy}
        onEnd={(endDate) => submit.run(() => api.POST("/tenancies/{id}/end", { params: { path: { id: row.id } }, body: { endDate } }), t("people.ended"))}
        onDelete={() => submit.run(() => api.DELETE("/tenancies/{id}", { params: { path: { id: row.id } } }))}
      />
    </div>
  );
}

function TenancySection({ people, submit }: { people: LocationPeople; submit: Submit }) {
  const t = useTranslations("Members");
  const [adding, setAdding] = useState(false);
  const rows = people.tenancies ?? [];
  const open = rows.find((row) => row.status !== "ended");
  const past = rows.filter((row) => row.status === "ended");
  const can = people.can.tenancies;

  return (
    <Block
      title={t("people.tenancy")}
      actions={
        !open && !adding && can.create ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            {t("people.addTenancy")}
          </Button>
        ) : null
      }
    >
      {adding ? <AddTenancyForm unitId={people.location.id} past={rows} submit={submit} onDone={() => setAdding(false)} /> : null}
      {open ? <OpenTenancy row={open} can={can} submit={submit} /> : adding ? null : <Empty>{t("people.noTenancy")}</Empty>}
      <Past title={t("people.pastTenancies")} count={past.length}>
        {past.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-x-2">
            {row.renter ? <PartyLink party={row.renter} /> : null}
            <span className="text-muted-foreground">
              {t(`renterRole.${row.renterType}`)} · <DateRange start={row.startDate} end={row.endDate} />
            </span>
          </li>
        ))}
      </Past>
    </Block>
  );
}

// ---------------------------------------------------------------------------
// Household
// ---------------------------------------------------------------------------

function AddOccupantForm({ unitId, tenancyId, submit, onDone }: { unitId: string; tenancyId: string | null; submit: Submit; onDone: () => void }) {
  const t = useTranslations("Members");
  const [person, setPerson] = useState(emptyPerson);
  const [household, setHousehold] = useState<string | null>(tenancyId);
  const [relation, setRelation] = useState<OccupantRelation>("head");
  const [startDate, setStartDate] = useState(todayIso);
  return (
    <form
      noValidate
      className="grid gap-3.5 rounded-[10px] border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await submit.run(
          () => api.POST("/occupants", { body: { unitId, tenancyId: household, person: personBody(person), relation, startDate } }),
          t("people.added"),
        );
        if (done) onDone();
      }}
    >
      <PersonFields id="occupant" values={person} onChange={setPerson} short />
      <p className="text-[12.5px] text-muted-foreground">{t("people.reuseHint")}</p>
      <div className="grid gap-3.5 min-[600px]:grid-cols-3">
        <Field label={t("people.householdOf")} htmlFor="occupant-household">
          <select
            id="occupant-household"
            className={inputClass}
            value={household ?? ""}
            onChange={(e) => setHousehold(e.target.value || null)}
          >
            <option value="">{t("people.ownerHousehold")}</option>
            {tenancyId ? <option value={tenancyId}>{t("people.renterHousehold")}</option> : null}
          </select>
        </Field>
        <Field label={t("people.relationLabel")} htmlFor="occupant-relation">
          <select id="occupant-relation" className={inputClass} value={relation} onChange={(e) => setRelation(e.target.value as OccupantRelation)}>
            {OCCUPANT_RELATIONS.map((value) => (
              <option key={value} value={value}>
                {t(`relation.${value}`)}
              </option>
            ))}
          </select>
        </Field>
        <DateField id="occupant-start" label={t("people.startDate")} value={startDate} onChange={setStartDate} />
      </div>
      <FormActions busy={submit.busy} ready={!!person.fullName.trim() && !!startDate} onCancel={onDone} />
    </form>
  );
}

function OccupantLine({ row }: { row: Occupant }) {
  const t = useTranslations("Members");
  return (
    <div className="grid gap-0.5">
      <PartyLink party={row.person} />
      <span className="text-[12.5px] text-muted-foreground">
        {t(row.tenancyId ? "household.renter" : "household.owner", { relation: t(`relation.${row.relation}`) })} ·{" "}
        <DateRange start={row.startDate} end={row.endDate} />
      </span>
    </div>
  );
}

function HouseholdSection({ people, submit }: { people: LocationPeople; submit: Submit }) {
  const t = useTranslations("Members");
  const [adding, setAdding] = useState(false);
  const rows = people.occupants ?? [];
  const current = rows.filter((row) => row.endDate === null);
  const past = rows.filter((row) => row.endDate !== null);
  const openTenancy = (people.tenancies ?? []).find((row) => row.status !== "ended") ?? null;
  const can = people.can.occupants;
  // Owners (of the unit or a place above) who could be living here: offered while nobody rents it.
  const living = new Set(current.map((row) => row.person.id));
  const owners = [...(people.owners ?? []), ...(people.ownersAbove ?? [])].filter(
    (row) => row.endDate === null && row.owner.kind === "person" && !living.has(row.owner.id),
  );
  const ownerCandidates = can.create && !openTenancy ? [...new Map(owners.map((row) => [row.owner.id, row.owner])).values()] : [];

  return (
    <Block
      title={t("people.household")}
      actions={
        !adding && can.create ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            {t("people.addOccupant")}
          </Button>
        ) : null
      }
    >
      {adding ? <AddOccupantForm unitId={people.location.id} tenancyId={openTenancy?.id ?? null} submit={submit} onDone={() => setAdding(false)} /> : null}
      {ownerCandidates.length > 0 ? (
        <div className="grid gap-2 rounded-[10px] bg-surface-2 p-3 text-[13px]">
          <p className="text-[12.5px] text-muted-foreground">{t("people.livesHereHint")}</p>
          <ul className="grid gap-1.5">
            {ownerCandidates.map((owner) => (
              <li key={owner.id} className="flex flex-wrap items-center justify-between gap-2">
                <PartyLink party={owner} />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submit.busy}
                  onClick={() =>
                    submit.run(
                      () =>
                        api.POST("/occupants", {
                          body: { unitId: people.location.id, tenancyId: null, personId: owner.id, relation: "head", startDate: todayIso() },
                        }),
                      t("people.added"),
                    )
                  }
                >
                  <House aria-hidden />
                  {t("people.livesHere")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {current.length === 0 ? (
        adding ? null : <Empty>{t("people.noHousehold")}</Empty>
      ) : (
        <ul className="grid gap-2">
          {current.map((row) => (
            <li key={row.id} className={rowClass}>
              <OccupantLine row={row} />
              <RowActions
                canEnd={can.edit}
                canDelete={can.delete}
                disabled={submit.busy}
                onEnd={(endDate) => submit.run(() => api.POST("/occupants/{id}/end", { params: { path: { id: row.id } }, body: { endDate } }), t("people.ended"))}
                onDelete={() => submit.run(() => api.DELETE("/occupants/{id}", { params: { path: { id: row.id } } }))}
              />
            </li>
          ))}
        </ul>
      )}
      <Past title={t("people.pastHousehold")} count={past.length}>
        {past.map((row) => (
          <li key={row.id}>
            <OccupantLine row={row} />
          </li>
        ))}
      </Past>
    </Block>
  );
}

/**
 * Who owns, rents and lives at a location, with the changes the caller may make.
 * Units get all three blocks; other locations only the owners. Each block shows only
 * when the caller may view it there.
 */
export function PeoplePanel({ people, idsRequired }: { people: LocationPeople; idsRequired: boolean }) {
  const t = useTranslations("Members.people");
  const submit = useSubmit();
  return (
    <IdsRequired value={idsRequired}>
      <Card className="grid gap-4">
        <h2 className="text-[15px]">{t("title")}</h2>
        <FormStatus status={submit.status} />
        {people.owners !== null ? <OwnersSection people={people} submit={submit} /> : null}
        {people.location.isUnit && people.tenancies !== null ? <TenancySection people={people} submit={submit} /> : null}
        {people.location.isUnit && people.occupants !== null ? <HouseholdSection people={people} submit={submit} /> : null}
      </Card>
    </IdsRequired>
  );
}
