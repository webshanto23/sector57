"use client";

import {
  addMoney,
  formatTaka,
  localDigits,
  MAX_INVOICE_LINES,
  moneySchema,
  pick,
  type BillingLookup,
  type ChargeTypeList,
  type Locale,
} from "@s57/shared";
import { Plus, Search, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, Chip, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

type UnitHit = BillingLookup["units"][number];
type MemberHit = BillingLookup["members"][number];
type Target = { kind: "unit"; unit: UnitHit } | { kind: "member"; member: MemberHit };
type Line = { key: number; chargeTypeId: string; amount: string; description: string };

/** A new line with the first charge type and its usual amount. */
function newLine(key: number, active: ChargeTypeList["items"]): Line {
  const first = active[0];
  return { key, chargeTypeId: first?.id ?? "", amount: first?.defaultAmount ?? "", description: "" };
}

/**
 * A bill for one unit or member: find and choose who, then the lines, the months it
 * covers and the due date. The API works out who a unit's bill goes to and checks it again.
 */
export function InvoiceForm({
  chargeTypes,
  initialUnit,
  initialMember = null,
  dueDefault,
}: {
  chargeTypes: ChargeTypeList;
  initialUnit: UnitHit | null;
  /** A member chosen up front (their membership fee). */
  initialMember?: MemberHit | null;
  /** `YYYY-MM-DD`, from the server (Dhaka), so the first render matches. */
  dueDefault: string;
}) {
  const t = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, setStatus, busy, run } = useSubmit();
  const active = chargeTypes.items.filter((type) => !type.archived);
  const typeOf = (id: string) => active.find((type) => type.id === id);

  const [target, setTarget] = useState<Target | null>(
    initialUnit?.billTo ? { kind: "unit", unit: initialUnit } : initialMember ? { kind: "member", member: initialMember } : null,
  );
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<BillingLookup | null>(initialUnit && !initialUnit.billTo ? { units: [initialUnit], members: [] } : null);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>(() => [newLine(0, active)]);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [dueDate, setDueDate] = useState(dueDefault);

  async function find() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.GET("/billing/lookup", { params: { query: { q } } });
      setHits(data ?? { units: [], members: [] });
    } finally {
      setSearching(false);
    }
  }

  function changeType(index: number, chargeTypeId: string) {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        // An untouched amount follows the charge type's usual amount.
        const before = typeOf(line.chargeTypeId)?.defaultAmount ?? "";
        const amount = line.amount === "" || line.amount === before ? (typeOf(chargeTypeId)?.defaultAmount ?? "") : line.amount;
        return { ...line, chargeTypeId, amount };
      }),
    );
  }

  const amountsOk = lines.map((line) => moneySchema.safeParse(line.amount));
  const total = amountsOk.every((r) => r.success) ? addMoney(...amountsOk.map((r) => (r.success ? r.data : "0"))) : null;
  const fund = typeOf(lines[0]?.chargeTypeId ?? "")?.fund;

  async function save() {
    if (!target) {
      setStatus({ ok: false, text: t("new.pickFirst") });
      return;
    }
    const body = {
      ...(target.kind === "unit" ? { unitId: target.unit.id } : target.member.kind === "person" ? { personId: target.member.id } : { organisationId: target.member.id }),
      dueDate,
      periodFrom: periodFrom || null,
      periodTo: periodTo || null,
      lines: lines.map((line) => ({ chargeTypeId: line.chargeTypeId, amount: line.amount, description: line.description, descriptionEn: null })),
    };
    const made = await run(() => api.POST("/invoices", { body }));
    if (made) router.push(`/dashboard/billing/${made.id}`);
  }

  if (active.length === 0) return <Note tone="warn">{t("new.noChargeTypes")}</Note>;

  const roleOf = (role: "owner" | "renter" | "member") => t(`role.${role}`);

  return (
    <form
      noValidate
      className="grid max-w-[900px] gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card className="grid gap-3">
        <h2 className="text-[15px]">{t("new.find")}</h2>
        {target ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-surface-2 p-3">
            {target.kind === "unit" ? (
              <div className="min-w-0">
                <p className="font-semibold">{target.unit.name}</p>
                <p className="text-[13px] text-muted-foreground">{target.unit.address.join(", ")}</p>
                {target.unit.billTo ? (
                  <p className="text-[13.5px]">
                    {t("new.billsTo", { name: pick(target.unit.billTo.name, target.unit.billTo.nameEn, locale), role: roleOf(target.unit.billTo.role) })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0">
                <p className="font-semibold">{pick(target.member.name, target.member.nameEn, locale)}</p>
                <p className="text-[13px] text-muted-foreground">{target.member.membershipCode ? t("memberNo", { no: target.member.membershipCode }) : t("idPending")}</p>
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => setTarget(null)}>
              {t("new.change")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input
                type="search"
                className={`${inputClass} min-w-0 flex-1`}
                value={q}
                placeholder={t("new.findPlaceholder")}
                aria-label={t("new.find")}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void find();
                  }
                }}
              />
              <Button type="button" variant="outline" disabled={searching} onClick={() => void find()}>
                <Search aria-hidden />
                {t("new.search")}
              </Button>
            </div>
            {hits ? (
              hits.units.length + hits.members.length === 0 ? (
                <p className="text-[13.5px] text-muted-foreground">{t("new.noMatch")}</p>
              ) : (
                <div className="grid gap-3">
                  {hits.units.length ? (
                    <HitList title={t("new.units")}>
                      {hits.units.map((unit) => (
                        <li key={unit.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-semibold">
                              {unit.name}
                              {!unit.isActive ? <Chip tone="warn">{t("new.inactive")}</Chip> : null}
                            </p>
                            <p className="text-[13px] text-muted-foreground">{unit.address.join(", ")}</p>
                            <p className="text-[13px]">
                              {unit.billTo
                                ? t("new.billsTo", { name: pick(unit.billTo.name, unit.billTo.nameEn, locale), role: roleOf(unit.billTo.role) })
                                : t("new.nobody")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!unit.billTo || !unit.isActive}
                            onClick={() => setTarget({ kind: "unit", unit })}
                          >
                            {t("new.choose")}
                          </Button>
                        </li>
                      ))}
                    </HitList>
                  ) : null}
                  {hits.members.length ? (
                    <HitList title={t("new.members")}>
                      {hits.members.map((member) => (
                        <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <p className="font-semibold">{pick(member.name, member.nameEn, locale)}</p>
                            <p className="text-[13px] text-muted-foreground">{member.membershipCode ? t("memberNo", { no: member.membershipCode }) : t("idPending")}</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => setTarget({ kind: "member", member })}>
                            {t("new.choose")}
                          </Button>
                        </li>
                      ))}
                    </HitList>
                  ) : null}
                </div>
              )
            ) : null}
          </>
        )}
      </Card>

      <Card className="grid gap-3">
        <ol className="grid gap-3">
          {lines.map((line, index) => {
            const id = `line-${line.key}`;
            const ok = amountsOk[index]?.success ?? false;
            return (
              <li key={line.key} className="grid gap-3 rounded-[8px] border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-muted-foreground">{t("new.lineN", { n: localDigits(index + 1, locale) })}</span>
                  {lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("new.removeLine")}
                      title={t("new.removeLine")}
                      onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 min-[600px]:grid-cols-2">
                  <Field label={t("new.chargeType")} htmlFor={`${id}-type`}>
                    <select id={`${id}-type`} className={inputClass} value={line.chargeTypeId} onChange={(e) => changeType(index, e.target.value)}>
                      {active.map((type) => (
                        <option key={type.id} value={type.id}>
                          {pick(type.nameBn, type.nameEn, locale)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("new.amount")} htmlFor={`${id}-amount`}>
                    <input
                      id={`${id}-amount`}
                      inputMode="decimal"
                      className={`${inputClass} num`}
                      value={line.amount}
                      aria-invalid={(line.amount !== "" && !ok) || undefined}
                      onChange={(e) => setLines((current) => current.map((l, i) => (i === index ? { ...l, amount: e.target.value } : l)))}
                    />
                  </Field>
                </div>
                <Field label={t("new.description")} htmlFor={`${id}-description`}>
                  <input
                    id={`${id}-description`}
                    className={inputClass}
                    value={line.description}
                    maxLength={200}
                    placeholder={t("new.descriptionHint")}
                    onChange={(e) => setLines((current) => current.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)))}
                  />
                </Field>
              </li>
            );
          })}
        </ol>
        {lines.length < MAX_INVOICE_LINES ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => setLines((current) => [...current, newLine(Math.max(...current.map((l) => l.key)) + 1, active)])}
          >
            <Plus aria-hidden />
            {t("new.addLine")}
          </Button>
        ) : null}
        <p className="text-[12.5px] text-muted-foreground">{t("new.fineHint")}</p>
        {chargeTypes.separateFunds && fund ? (
          <p className="text-[12.5px] text-muted-foreground">{t("new.oneFund", { fund: pick(fund.nameBn, fund.nameEn, locale) })}</p>
        ) : null}
      </Card>

      <Card className="grid gap-3 min-[600px]:grid-cols-3">
        <Field label={t("new.periodFrom")} htmlFor="period-from">
          <input id="period-from" type="month" className={inputClass} value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
        </Field>
        <Field label={t("new.periodTo")} htmlFor="period-to">
          <input
            id="period-to"
            type="month"
            className={inputClass}
            value={periodTo}
            min={periodFrom || undefined}
            disabled={!periodFrom}
            onChange={(e) => setPeriodTo(e.target.value)}
          />
        </Field>
        <Field label={t("new.dueDate")} htmlFor="due-date">
          <input id="due-date" type="date" className={inputClass} value={dueDate} required onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <p className="text-[12.5px] text-muted-foreground min-[600px]:col-span-3">{t("new.periodHint")}</p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px]">
          {t("new.total")}: <b className="num text-lg">{total ? formatTaka(total, locale) : "—"}</b>
        </p>
        <Button type="submit" disabled={busy || !target || total === null}>
          {busy ? t("new.creating") : t("new.create")}
        </Button>
      </div>
      <FormStatus status={status} />
    </form>
  );
}

function HitList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1">
      <h3 className="text-[13px] font-semibold text-muted-foreground">{title}</h3>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}
