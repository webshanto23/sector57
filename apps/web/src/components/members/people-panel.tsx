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
  type Ownership,
  type RenterType,
  type Tenancy,
} from "@s57/shared";
import { ArrowRightLeft, House, Plus, UserPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { CheckField, TextField } from "@/components/cms/fields";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { DateRange, PartyLink, PlaceLink, TenancyStatusChip } from "./labels";
import { DateField, emptyParty, PartyFields, partyBody, partyReady, RowActions, todayIso, type PartyValues } from "./party-fields";
import { emptyPerson, PersonFields, personBody } from "./person-fields";

type Submit = ReturnType<typeof useSubmit>;
type OpenStatus = (typeof OPEN_TENANCY_STATUSES)[number];

/** A titled block with its add buttons on the right. */
function Block({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid content-start gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[10px] border border-dashed border-line p-3 text-[13px] text-muted-foreground">{children}</p>;
}

/** Older rows, folded away. */
function Past({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const locale = useLocale() as Locale;
  if (count === 0) return null;
  return (
    <details className="rounded-[10px] border border-line p-2.5 text-[13px]">
      <summary className="cursor-pointer font-semibold">
        {title} ({localDigits(count, locale)})
      </summary>
      <ul className="mt-2 grid gap-2">{children}</ul>
    </details>
  );
}

const rowClass = "grid gap-2 rounded-[10px] border border-line bg-surface p-3 min-[700px]:grid-cols-[minmax(0,1fr)_auto] min-[700px]:items-center";

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

function OwnerLine({ row }: { row: Ownership }) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  return (
    <div className="grid gap-0.5">
      <span className="flex flex-wrap items-center gap-x-2">
        <PartyLink party={row.owner} />
        <span className="num text-[12.5px] text-muted-foreground">{localDigits(t("sharePercent", { share: row.sharePercent }), locale)}</span>
      </span>
      <span className="text-[12.5px] text-muted-foreground">
        <DateRange start={row.startDate} end={row.endDate} />
        {row.owner.phone ? <span className="num"> · {localDigits(row.owner.phone, locale)}</span> : null}
      </span>
    </div>
  );
}

function AddOwnerForm({ locationId, submit, onDone }: { locationId: string; submit: Submit; onDone: () => void }) {
  const t = useTranslations("Members");
  const [party, setParty] = useState<PartyValues>(emptyParty);
  const [share, setShare] = useState("100");
  const [startDate, setStartDate] = useState(todayIso);
  return (
    <form
      noValidate
      className="grid gap-3.5 rounded-[10px] border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await submit.run(
          () => api.POST("/ownerships", { body: { locationId, owner: partyBody(party), sharePercent: share, startDate } }),
          t("people.added"),
        );
        if (done) onDone();
      }}
    >
      <PartyFields id="owner" values={party} onChange={setParty} />
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <TextField id="owner-share" label={t("share")} inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} />
        <DateField id="owner-start" label={t("people.startDate")} value={startDate} onChange={setStartDate} />
      </div>
      <FormActions busy={submit.busy} ready={partyReady(party) && !!startDate} onCancel={onDone} />
    </form>
  );
}

function TransferForm({ locationId, submit, onDone }: { locationId: string; submit: Submit; onDone: () => void }) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  const [date, setDate] = useState(todayIso);
  const [owners, setOwners] = useState<{ party: PartyValues; share: string }[]>([{ party: emptyParty, share: "100" }]);
  const change = (index: number, next: Partial<{ party: PartyValues; share: string }>) =>
    setOwners(owners.map((owner, i) => (i === index ? { ...owner, ...next } : owner)));

  return (
    <form
      noValidate
      className="grid gap-3.5 rounded-[10px] border border-line p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await submit.run(
          () =>
            api.POST("/ownerships/transfer", {
              body: { locationId, date, owners: owners.map((owner) => ({ owner: partyBody(owner.party), sharePercent: owner.share })) },
            }),
          t("people.transferred"),
        );
        if (done) onDone();
      }}
    >
      <p className="text-[12.5px] text-muted-foreground">{t("people.transferHint")}</p>
      <DateField id="transfer-date" label={t("people.transferDate")} value={date} onChange={setDate} />
      {owners.map((owner, index) => (
        <fieldset key={index} className="grid gap-3 rounded-[10px] border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold">{t("people.newOwnerN", { n: localDigits(index + 1, locale) })}</legend>
          <PartyFields id={`transfer-${index}`} values={owner.party} onChange={(party) => change(index, { party })} />
          <div className="flex flex-wrap items-end gap-2">
            <TextField
              id={`transfer-${index}-share`}
              label={t("share")}
              inputMode="decimal"
              value={owner.share}
              onChange={(e) => change(index, { share: e.target.value })}
            />
            {owners.length > 1 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setOwners(owners.filter((_, i) => i !== index))}>
                <X aria-hidden />
                {t("people.removeOwner")}
              </Button>
            ) : null}
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={owners.length >= 20}
        onClick={() => setOwners([...owners, { party: emptyParty, share: "" }])}
      >
        <Plus aria-hidden />
        {t("people.addAnother")}
      </Button>
      <FormActions busy={submit.busy} ready={!!date && owners.every((owner) => partyReady(owner.party))} onCancel={onDone} />
    </form>
  );
}

function OwnersSection({ people, submit }: { people: LocationPeople; submit: Submit }) {
  const t = useTranslations("Members");
  const [adding, setAdding] = useState<"owner" | "transfer" | null>(null);
  const owners = people.owners ?? [];
  const current = owners.filter((row) => row.endDate === null);
  const past = owners.filter((row) => row.endDate !== null);
  const can = people.can.ownerships;
  const above = people.ownersAbove ?? [];

  return (
    <Block
      title={t("people.owners")}
      actions={
        adding ? null : (
          <>
            {can.create ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setAdding("owner")}>
                <UserPlus aria-hidden />
                {t("people.addOwner")}
              </Button>
            ) : null}
            {can.create && can.edit ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setAdding("transfer")}>
                <ArrowRightLeft aria-hidden />
                {t("people.transfer")}
              </Button>
            ) : null}
          </>
        )
      }
    >
      {adding === "owner" ? <AddOwnerForm locationId={people.location.id} submit={submit} onDone={() => setAdding(null)} /> : null}
      {adding === "transfer" ? <TransferForm locationId={people.location.id} submit={submit} onDone={() => setAdding(null)} /> : null}
      {current.length === 0 ? (
        <Empty>{t("people.noOwner")}</Empty>
      ) : (
        <ul className="grid gap-2">
          {current.map((row) => (
            <li key={row.id} className={rowClass}>
              <OwnerLine row={row} />
              <RowActions
                canEnd={can.edit}
                canDelete={can.delete}
                disabled={submit.busy}
                onEnd={(endDate) => submit.run(() => api.POST("/ownerships/{id}/end", { params: { path: { id: row.id } }, body: { endDate } }), t("people.ended"))}
                onDelete={() => submit.run(() => api.DELETE("/ownerships/{id}", { params: { path: { id: row.id } } }))}
              />
            </li>
          ))}
        </ul>
      )}
      {above.length > 0 ? (
        <div className="grid gap-1.5 rounded-[10px] bg-surface-2 p-3 text-[13px]">
          <p className="font-semibold">{t("people.ownersAbove")}</p>
          <p className="text-[12.5px] text-muted-foreground">{t("people.ownersAboveHint")}</p>
          <ul className="grid gap-1">
            {above.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-2">
                <PartyLink party={row.owner} />
                <span className="text-muted-foreground">
                  · <PlaceLink place={row.place} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Past title={t("people.pastOwners")} count={past.length}>
        {past.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-2">
            <OwnerLine row={row} />
            <RowActions
              canEnd={false}
              canDelete={can.delete}
              disabled={submit.busy}
              onEnd={async () => undefined}
              onDelete={() => submit.run(() => api.DELETE("/ownerships/{id}", { params: { path: { id: row.id } } }))}
            />
          </li>
        ))}
      </Past>
    </Block>
  );
}

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

function AddTenancyForm({ unitId, submit, onDone }: { unitId: string; submit: Submit; onDone: () => void }) {
  const t = useTranslations("Members");
  const [party, setParty] = useState<PartyValues>(emptyParty);
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
        const done = await submit.run(() => api.POST("/tenancies", { body: { unitId, renter: partyBody(party), ...values } }), t("people.added"));
        if (done) onDone();
      }}
    >
      <PartyFields id="renter" values={party} onChange={setParty} />
      {party.kind === "person" ? <p className="text-[12.5px] text-muted-foreground">{t("people.renterIsResident")}</p> : null}
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
      <FormActions busy={submit.busy} ready={partyReady(party) && !!values.startDate} onCancel={onDone} />
    </form>
  );
}

function OpenTenancy({ row, can, submit }: { row: Tenancy; can: LocationPeople["can"]["tenancies"]; submit: Submit }) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
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
        {can.edit ? (
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label={t("statusLabel")}
              className={`${inputClass} w-auto`}
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
      {adding ? <AddTenancyForm unitId={people.location.id} submit={submit} onDone={() => setAdding(false)} /> : null}
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

function FormActions({ busy, ready, onCancel }: { busy: boolean; ready: boolean; onCancel: () => void }) {
  const t = useTranslations("Members.people");
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={busy || !ready}>
        {t("add")}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t("cancel")}
      </Button>
    </div>
  );
}

/**
 * Who owns, rents and lives at a location, with the changes the caller may make.
 * Units get all three blocks; other locations only the owners. Each block shows only
 * when the caller may view it there.
 */
export function PeoplePanel({ people }: { people: LocationPeople }) {
  const t = useTranslations("Members.people");
  const submit = useSubmit();
  return (
    <Card className="grid gap-4">
      <h2 className="text-[15px]">{t("title")}</h2>
      <FormStatus status={submit.status} />
      {people.owners !== null ? <OwnersSection people={people} submit={submit} /> : null}
      {people.location.isUnit && people.tenancies !== null ? <TenancySection people={people} submit={submit} /> : null}
      {people.location.isUnit && people.occupants !== null ? <HouseholdSection people={people} submit={submit} /> : null}
    </Card>
  );
}
