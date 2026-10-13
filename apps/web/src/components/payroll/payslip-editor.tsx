"use client";

import {
  formatTaka,
  lineTotals,
  moneyOrZeroSchema,
  payslipNet,
  PAYSLIP_LINE_LIMIT,
  pick,
  type FundOption,
  type Locale,
  type Payslip,
  type PayslipLineKind,
} from "@s57/shared";
import { Minus, Plus, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

type Line = { key: number; kind: PayslipLineKind; labelBn: string; labelEn: string; amount: string };

/** What a typed amount counts as in the preview; the API validates it again. */
const typedAmount = (value: string) => {
  const parsed = moneyOrZeroSchema.safeParse(value);
  return parsed.success ? parsed.data : "0.00";
};

/** A draft payslip's allowance and deduction lines, fund and note, saved together. */
export function PayslipEditor({ runId, payslip, funds }: { runId: string; payslip: Payslip; funds: FundOption[] }) {
  const t = useTranslations("Payroll.editor");
  const locale = useLocale() as Locale;
  const { status, busy, run } = useSubmit();
  const [lines, setLines] = useState<Line[]>(() =>
    payslip.lines.map((line, key) => ({ key, kind: line.kind, labelBn: line.labelBn, labelEn: line.labelEn ?? "", amount: line.amount })),
  );
  const [nextKey, setNextKey] = useState(payslip.lines.length);
  const [fundId, setFundId] = useState(payslip.fund.id);
  const [note, setNote] = useState(payslip.note ?? "");
  const totals = lineTotals(lines.map((line) => ({ kind: line.kind, amount: typedAmount(line.amount) })));
  const net = payslipNet(payslip.base, payslip.attendanceDeduction, totals.allowances, totals.deductions);
  // The payslip's own fund stays offered even if it is no longer in the list.
  const fundOptions = funds.some((fund) => fund.id === payslip.fund.id) ? funds : [{ ...payslip.fund, isDefault: false }, ...funds];

  const add = (kind: PayslipLineKind) => {
    setLines([...lines, { key: nextKey, kind, labelBn: "", labelEn: "", amount: "" }]);
    setNextKey(nextKey + 1);
  };
  const change = (key: number, patch: Partial<Line>) => setLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <Card className="grid content-start gap-3">
      <div>
        <h2 className="text-[15px]">{t("title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
      </div>
      {lines.map((line, index) => (
        <fieldset key={line.key} className="grid gap-2 rounded-[10px] border border-line p-2.5">
          <legend className="px-1 text-[12.5px] font-semibold">{t(`kind.${line.kind}`)}</legend>
          <Field label={t("label")} htmlFor={`line-${line.key}-bn`}>
            <input id={`line-${line.key}-bn`} className={inputClass} value={line.labelBn} maxLength={100} onChange={(e) => change(line.key, { labelBn: e.target.value })} />
          </Field>
          <Field label={t("labelEn")} htmlFor={`line-${line.key}-en`}>
            <input id={`line-${line.key}-en`} className={inputClass} value={line.labelEn} maxLength={100} onChange={(e) => change(line.key, { labelEn: e.target.value })} />
          </Field>
          <div className="flex items-end gap-2">
            <div className="grow">
              <Field label={t("amount")} htmlFor={`line-${line.key}-amount`}>
                <input id={`line-${line.key}-amount`} inputMode="decimal" className={inputClass} value={line.amount} onChange={(e) => change(line.key, { amount: e.target.value })} />
              </Field>
            </div>
            <Button type="button" variant="ghost" aria-label={`${t("remove")} ${index + 1}`} onClick={() => setLines(lines.filter((other) => other.key !== line.key))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
        </fieldset>
      ))}
      {lines.length < PAYSLIP_LINE_LIMIT ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => add("allowance")}>
            <Plus aria-hidden />
            {t("addAllowance")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => add("deduction")}>
            <Minus aria-hidden />
            {t("addDeduction")}
          </Button>
        </div>
      ) : null}
      {fundOptions.length > 1 ? (
        <Field label={t("fund")} htmlFor="payslip-fund">
          <select id="payslip-fund" className={inputClass} value={fundId} onChange={(e) => setFundId(e.target.value)}>
            {fundOptions.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {pick(fund.nameBn, fund.nameEn, locale)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label={t("note")} htmlFor="payslip-note">
        <input id="payslip-note" className={inputClass} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {net === null ? <Note tone="warn">{t("negative")}</Note> : <p className="text-[13.5px] font-semibold">{t("netPreview", { amount: formatTaka(net, locale) })}</p>}
      <div>
        <Button
          type="button"
          disabled={busy || net === null}
          onClick={() =>
            void run(
              () =>
                api.PATCH("/payroll/{id}/payslips/{payslipId}", {
                  params: { path: { id: runId, payslipId: payslip.id } },
                  body: { fundId, note, lines: lines.map(({ kind, labelBn, labelEn, amount }) => ({ kind, labelBn, labelEn, amount })) },
                }),
              t("savedNow"),
            )
          }
        >
          <Save aria-hidden />
          {t("save")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
