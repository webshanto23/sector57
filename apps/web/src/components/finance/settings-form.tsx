"use client";

import {
  amountInWords,
  fiscalYearOf,
  formatDate,
  formatTaka,
  localDigits,
  LOGO_MARK_MAX,
  type Locale,
  type SettingsInput,
  type SocietySettings,
} from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus, Note } from "@/components/admin/form-status";
import { CheckField } from "@/components/cms/fields";
import { Card, Field, inputClass } from "@/components/kit";
import { Logo } from "@/components/site/logo";
import { PaperCard, toPaper } from "./paper-card";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { refreshPublicSite } from "@/lib/actions/public-site";
import { api } from "@/lib/api/client";
import { todayInDhaka } from "@/lib/dhaka-time";

type Header = {
  nameBn: string;
  nameEn: string;
  addressBn: string;
  addressEn: string;
  phone: string;
  email: string;
  regNo: string;
  officeHoursBn: string;
  officeHoursEn: string;
};

const toHeader = (h: SocietySettings["receiptHeader"]): Header => ({
  nameBn: h.nameBn,
  nameEn: h.nameEn ?? "",
  addressBn: h.addressBn ?? "",
  addressEn: h.addressEn ?? "",
  phone: h.phone ?? "",
  email: h.email ?? "",
  regNo: h.regNo ?? "",
  officeHoursBn: h.officeHoursBn ?? "",
  officeHoursEn: h.officeHoursEn ?? "",
});

type Profile = { nameBn: string; nameEn: string; mark: string; placeBn: string; placeEn: string };

const toProfile = (p: SocietySettings["profile"]): Profile => ({
  nameBn: p.nameBn,
  nameEn: p.nameEn ?? "",
  mark: p.mark,
  placeBn: p.placeBn ?? "",
  placeEn: p.placeEn ?? "",
});

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const SAMPLE_AMOUNT = "4500";

/** The society profile, the president's switches, the fiscal year start and the receipt header. Sends only what changed. */
export function SettingsForm({ settings, canEdit }: { settings: SocietySettings; canEdit: boolean }) {
  const t = useTranslations("Finance.settings");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [saved, setSaved] = useState(settings);
  const [thana, setThana] = useState(settings.shareRentersWithThana);
  const [separate, setSeparate] = useState(settings.separateFacilityFunds);
  const [requireIds, setRequireIds] = useState(settings.requireIdNumbers);
  const [month, setMonth] = useState(settings.fiscalYearStartMonth);
  const [header, setHeader] = useState(() => toHeader(settings.receiptHeader));
  const [profile, setProfile] = useState(() => toProfile(settings.profile));
  const [paper, setPaper] = useState(() => toPaper(settings.printFormats));

  const year = fiscalYearOf(todayInDhaka(), month);
  const monthName = (m: number) =>
    new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, m - 1, 1)));
  const headerChanged = JSON.stringify(header) !== JSON.stringify(toHeader(saved.receiptHeader));
  const profileChanged = JSON.stringify(profile) !== JSON.stringify(toProfile(saved.profile));
  const paperChanged = JSON.stringify(paper) !== JSON.stringify(toPaper(saved.printFormats));
  const readOnly = !canEdit || busy;

  async function save() {
    const body: SettingsInput = {};
    if (thana !== saved.shareRentersWithThana) body.shareRentersWithThana = thana;
    if (separate !== saved.separateFacilityFunds) body.separateFacilityFunds = separate;
    if (requireIds !== saved.requireIdNumbers) body.requireIdNumbers = requireIds;
    if (month !== saved.fiscalYearStartMonth) body.fiscalYearStartMonth = month;
    // Blank fields become null in the API.
    if (headerChanged) body.receiptHeader = header;
    if (profileChanged) body.profile = profile;
    if (paperChanged) body.printFormats = paper;
    const result = await run(() => api.PATCH("/settings", { body }));
    if (result) {
      setSaved(result);
      setHeader(toHeader(result.receiptHeader));
      setProfile(toProfile(result.profile));
      setPaper(toPaper(result.printFormats));
      if (profileChanged || body.requireIdNumbers !== undefined) {
        // The name and badge are on every public page and in the header above; the ID rule is on the forms page.
        await refreshPublicSite().catch(() => undefined);
        router.refresh();
      }
    } else if (result === undefined) {
      // Put the switches back where the server has them; the message says why.
      setSeparate(saved.separateFacilityFunds);
      setRequireIds(saved.requireIdNumbers);
      setMonth(saved.fiscalYearStartMonth);
    }
  }

  const headerField = (key: keyof Header, label: string, extra: { lang?: string; required?: boolean; type?: string } = {}) => (
    <Field label={label} htmlFor={`header-${key}`}>
      <input
        id={`header-${key}`}
        className={inputClass}
        value={header[key]}
        disabled={readOnly}
        onChange={(e) => setHeader({ ...header, [key]: e.target.value })}
        {...extra}
      />
    </Field>
  );

  const profileField = (key: keyof Profile, label: string, extra: { lang?: string; required?: boolean; maxLength?: number; hint?: string } = {}) => {
    const { hint, ...rest } = extra;
    return (
      <Field label={label} htmlFor={`profile-${key}`}>
        <input
          id={`profile-${key}`}
          className={inputClass}
          value={profile[key]}
          disabled={readOnly}
          aria-describedby={hint ? `profile-${key}-hint` : undefined}
          onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
          {...rest}
        />
        {hint ? (
          <span id={`profile-${key}-hint`} className="text-[12.5px] text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </Field>
    );
  };
  const previewName = (locale === "en" && profile.nameEn.trim()) || profile.nameBn;
  const previewPlace = (locale === "en" && profile.placeEn.trim()) || profile.placeBn;

  return (
    <form
      noValidate
      className="grid max-w-[900px] gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!canEdit ? <Note>{t("readOnly")}</Note> : null}

      <Card className="grid gap-3.5">
        <div>
          <h2 className="text-[15px]">{t("profile")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("profileHint")}</p>
        </div>
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          {profileField("nameBn", t("nameBn"), { required: true })}
          {profileField("nameEn", t("nameEn"), { lang: "en" })}
          {profileField("placeBn", t("placeBn"), { hint: t("placeHint") })}
          {profileField("placeEn", t("placeEn"), { lang: "en" })}
          {profileField("mark", t("mark"), { required: true, maxLength: LOGO_MARK_MAX, hint: t("markHint") })}
        </div>
        <div aria-label={t("preview")} className="rounded-[10px] border border-dashed border-line bg-surface-2 p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{t("preview")}</p>
          <div className="flex items-center gap-2.5 leading-tight font-bold">
            <Logo mark={profile.mark} />
            <span className="min-w-0">
              {previewName || "—"}
              {previewPlace ? <span className="block text-xs font-medium text-muted-foreground">{previewPlace}</span> : null}
            </span>
          </div>
        </div>
      </Card>

      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("switches")}</h2>
        <CheckField
          id="separate-funds"
          label={t("separateFunds")}
          hint={t("separateFundsHint")}
          checked={separate}
          disabled={readOnly}
          onChange={(e) => setSeparate(e.target.checked)}
        />
        <CheckField
          id="share-thana"
          label={t("shareThana")}
          hint={t("shareThanaHint")}
          checked={thana}
          disabled={readOnly}
          onChange={(e) => setThana(e.target.checked)}
        />
        <CheckField
          id="require-ids"
          label={t("requireIds")}
          hint={t("requireIdsHint")}
          checked={requireIds}
          disabled={readOnly}
          onChange={(e) => setRequireIds(e.target.checked)}
        />
      </Card>

      <Card className="grid gap-3">
        <h2 className="text-[15px]">{t("fiscalYear")}</h2>
        <Field label={t("fiscalStart")} htmlFor="fiscal-start">
          <select
            id="fiscal-start"
            className={`${inputClass} max-w-[260px]`}
            value={month}
            disabled={readOnly || saved.fiscalYearLocked}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-[13px] text-muted-foreground">
          {t("fiscalNow", {
            label: localDigits(year.label, locale),
            start: formatDate(year.start, locale, "long"),
            end: formatDate(year.end, locale, "long"),
          })}
        </p>
        {saved.fiscalYearLocked ? <Note tone="warn">{t("fiscalLocked")}</Note> : null}
      </Card>

      <Card className="grid gap-3.5">
        <div>
          <h2 className="text-[15px]">{t("receiptHeader")}</h2>
          <p className="text-[13px] text-muted-foreground">{t("receiptHeaderHint")}</p>
        </div>
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          {headerField("nameBn", t("nameBn"), { required: true })}
          {headerField("nameEn", t("nameEn"), { lang: "en" })}
          {headerField("addressBn", t("addressBn"))}
          {headerField("addressEn", t("addressEn"), { lang: "en" })}
          {headerField("phone", t("phone"))}
          {headerField("email", t("email"), { type: "email", lang: "en" })}
          {headerField("regNo", t("regNo"))}
          {headerField("officeHoursBn", t("officeHoursBn"))}
          {headerField("officeHoursEn", t("officeHoursEn"), { lang: "en" })}
        </div>
        <div aria-label={t("preview")} className="rounded-[10px] border border-dashed border-line bg-surface-2 p-4 text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">{t("preview")}</p>
          <p className="mt-1 text-[16px] font-bold">{header.nameBn || "—"}</p>
          {header.nameEn ? (
            <p lang="en" className="text-[13px]">
              {header.nameEn}
            </p>
          ) : null}
          {header.addressBn ? <p className="text-[12.5px] text-muted-foreground">{header.addressBn}</p> : null}
          {header.phone || header.email ? (
            <p className="text-[12.5px] text-muted-foreground">{[header.phone && localDigits(header.phone, locale), header.email].filter(Boolean).join(" · ")}</p>
          ) : null}
          <p className="mt-2 border-t border-line pt-2 text-[12.5px]">
            <span className="num font-semibold">{formatTaka(SAMPLE_AMOUNT, locale)}</span> · {amountInWords(SAMPLE_AMOUNT, locale)}
          </p>
        </div>
      </Card>

      <PaperCard value={paper} onChange={setPaper} disabled={readOnly} />

      <FormStatus status={status} />
      {canEdit ? (
        <Button type="submit" disabled={busy || !header.nameBn.trim() || !profile.nameBn.trim() || !profile.mark.trim()} className="justify-self-start">
          {busy ? t("saving") : t("save")}
        </Button>
      ) : null}
    </form>
  );
}
