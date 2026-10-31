"use client";

import { formatDate, localDigits, pick, type Locale, type LocationPeople, type Ownership } from "@s57/shared";
import { cn } from "cn";
import { ArrowRightLeft, Plus, UserPlus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useContext, useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card, DataTable, type Column } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { DateRange, PartyLink } from "./labels";
import { OwnersAbove } from "./owners-above";
import { DateField, emptyParty, IdsRequired, PartyFields, partyBody, partyReady, RowActions, todayIso, type PartyValues } from "./party-fields";
import { Block, Empty, FormActions, Past, rowClass } from "./people-blocks";

type Submit = ReturnType<typeof useSubmit>;

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
  const ids = useContext(IdsRequired);
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
      <PartyFields id="owner" values={party} onChange={setParty} memberLookup />
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <TextField id="owner-share" label={t("share")} inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} />
        <DateField id="owner-start" label={t("people.startDate")} value={startDate} onChange={setStartDate} />
      </div>
      <FormActions busy={submit.busy} ready={partyReady(party, ids) && !!startDate} onCancel={onDone} />
    </form>
  );
}

function TransferForm({ locationId, submit, onDone }: { locationId: string; submit: Submit; onDone: () => void }) {
  const t = useTranslations("Members");
  const ids = useContext(IdsRequired);
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
          <PartyFields id={`transfer-${index}`} values={owner.party} onChange={(party) => change(index, { party })} memberLookup />
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
      <FormActions busy={submit.busy} ready={!!date && owners.every((owner) => partyReady(owner.party, ids))} onCancel={onDone} />
    </form>
  );
}

/** The owners of a place. `cards` is the Owners tab: current owners and past owners as cards of their own. */
export function OwnersSection({ people, submit, transfer = false, cards = false }: { people: LocationPeople; submit: Submit; transfer?: boolean; cards?: boolean }) {
  const t = useTranslations("Members");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [adding, setAdding] = useState<"owner" | "transfer" | null>(transfer ? "transfer" : null);
  const owners = people.owners ?? [];
  const current = owners.filter((row) => row.endDate === null);
  const past = owners.filter((row) => row.endDate !== null);
  const can = people.can.ownerships;
  const remove = (id: string) => submit.run(() => api.DELETE("/ownerships/{id}", { params: { path: { id } } }));

  // The transfer form opened from the page header lives in the URL: leave it, so the button opens it again.
  function close() {
    setAdding(null);
    const page = people.location.isUnit ? `/dashboard/units/${people.location.id}?tab=people` : `/dashboard/property/${people.location.id}?tab=owners`;
    if (transfer) router.replace(page, { scroll: false });
  }

  const actions = adding ? null : (
    <>
      {can.create ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding("owner")}>
          <UserPlus aria-hidden />
          {t("people.addOwner")}
        </Button>
      ) : null}
      {can.create && can.edit && !cards ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding("transfer")}>
          <ArrowRightLeft aria-hidden />
          {t("people.transfer")}
        </Button>
      ) : null}
    </>
  );
  const body = (
    <>
      {adding === "owner" ? <AddOwnerForm locationId={people.location.id} submit={submit} onDone={close} /> : null}
      {adding === "transfer" ? <TransferForm locationId={people.location.id} submit={submit} onDone={close} /> : null}
      {current.length === 0 ? (
        <Empty>{t("people.noOwner")}</Empty>
      ) : (
        <ul className="grid gap-2">
          {current.map((row) => (
            <li key={row.id} className={cn(rowClass, cards && "border-l-[3px] border-l-primary")}>
              <OwnerLine row={row} />
              <RowActions
                canEnd={can.edit}
                canDelete={can.delete}
                disabled={submit.busy}
                onEnd={(endDate) => submit.run(() => api.POST("/ownerships/{id}/end", { params: { path: { id: row.id } }, body: { endDate } }), t("people.ended"))}
                onDelete={() => remove(row.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <OwnersAbove rows={people.ownersAbove ?? []} />
    </>
  );

  if (cards) {
    const columns: Column<Ownership>[] = [
      { key: "owner", header: t("people.colOwner"), cell: (row) => <PartyLink party={row.owner} /> },
      { key: "share", header: t("share"), cell: (row) => localDigits(t("sharePercent", { share: row.sharePercent }), locale) },
      { key: "from", header: t("people.colFrom"), cell: (row) => formatDate(row.startDate, locale, "short") },
      { key: "to", header: t("people.colTo"), cell: (row) => formatDate(row.endDate!, locale, "short") },
      {
        key: "actions",
        header: <span className="sr-only">{t("people.colActions")}</span>,
        cell: (row) => <RowActions canEnd={false} canDelete={can.delete} disabled={submit.busy} onEnd={async () => undefined} onDelete={() => remove(row.id)} />,
      },
    ];
    return (
      <>
        <Card>
          <Block title={t("people.currentOwner")} actions={actions}>
            {body}
          </Block>
        </Card>
        {past.length > 0 ? (
          <Card>
            <Block
              title={t("people.pastOwners")}
              actions={<span className="text-[12.5px] text-muted-foreground">{localDigits(t("people.recordCount", { count: past.length }), locale)}</span>}
            >
              <DataTable columns={columns} rows={past} rowKey={(row) => row.id} caption={t("people.pastOwners")} />
            </Block>
          </Card>
        ) : null}
      </>
    );
  }

  return (
    <Block
      title={people.location.levelBn ? t("people.ownersOf", { level: pick(people.location.levelBn, people.location.levelEn, locale) }) : t("people.owners")}
      actions={actions}
    >
      {body}
      <Past title={t("people.pastOwners")} count={past.length}>
        {past.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-2">
            <OwnerLine row={row} />
            <RowActions canEnd={false} canDelete={can.delete} disabled={submit.busy} onEnd={async () => undefined} onDelete={() => remove(row.id)} />
          </li>
        ))}
      </Past>
    </Block>
  );
}

/** The Owners tab of a place. */
export function OwnersPanel({ people, idsRequired, transfer }: { people: LocationPeople; idsRequired: boolean; transfer: boolean }) {
  const submit = useSubmit();
  return (
    <IdsRequired value={idsRequired}>
      <FormStatus status={submit.status} />
      <OwnersSection key={String(transfer)} people={people} submit={submit} transfer={transfer} cards />
    </IdsRequired>
  );
}
