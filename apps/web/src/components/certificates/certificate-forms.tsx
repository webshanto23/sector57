"use client";

import { CERTIFICATE_LANGS, CERTIFICATE_TYPES, type CertificateDetail, type CertificateLang, type CertificateType } from "@s57/shared";
import { Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { HolderFields, type Holder } from "./certificate-person";

/** A unit as the forms name it: its address and name. */
export type UnitLabel = { id: string; name: string };

type Letter = { lang: CertificateLang; addressee: string; purpose: string };

const letterBody = (letter: Letter) => ({ lang: letter.lang, addressee: letter.addressee.trim() || null, purpose: letter.purpose.trim() || null });

/** The letter's language, who it is addressed to and what it is for. */
function LetterFields({ id, value, onChange }: { id: string; value: Letter; onChange: (value: Letter) => void }) {
  const t = useTranslations("Certificates");
  return (
    <div className="grid gap-3.5 min-[600px]:grid-cols-2">
      <Field label={t("langLabel")} htmlFor={`${id}-lang`}>
        <select id={`${id}-lang`} className={inputClass} value={value.lang} onChange={(e) => onChange({ ...value, lang: e.target.value as CertificateLang })}>
          {CERTIFICATE_LANGS.map((lang) => (
            <option key={lang} value={lang}>
              {t(`lang.${lang}`)}
            </option>
          ))}
        </select>
      </Field>
      <TextField id={`${id}-purpose`} label={t("purpose")} hint={t("purposeHint")} value={value.purpose} maxLength={300} onChange={(e) => onChange({ ...value, purpose: e.target.value })} />
      <TextField
        id={`${id}-addressee`}
        className="min-[600px]:col-span-2"
        label={t("addressee")}
        hint={t("addresseeHint")}
        value={value.addressee}
        maxLength={300}
        onChange={(e) => onChange({ ...value, addressee: e.target.value })}
      />
    </div>
  );
}

/** A new draft: the type, the unit and person, then the letter's details. Opens its page once saved. */
export function NewCertificateForm({ unit, type: initialType }: { unit: UnitLabel | null; type: CertificateType | null }) {
  const t = useTranslations("Certificates");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [type, setType] = useState<CertificateType>(initialType ?? "noc_sale");
  const [holder, setHolder] = useState<Holder>({ unitId: unit?.id ?? null, personId: null });
  const [letter, setLetter] = useState<Letter>({ lang: "bn", addressee: "", purpose: "" });
  const ready = holder.unitId !== null && holder.personId !== null;

  async function save() {
    if (!holder.unitId || !holder.personId) return;
    const made = await run(() => api.POST("/certificates", { body: { type, ...letterBody(letter), unitId: holder.unitId!, personId: holder.personId! } }));
    if (made) router.push(`/dashboard/certificates/${made.id}`);
  }

  return (
    <form
      noValidate
      className="grid gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("typeLabel")}</h2>
        <Field label={t("typeLabel")} htmlFor="certificate-type">
          <select
            id="certificate-type"
            className={inputClass}
            value={type}
            onChange={(e) => {
              setType(e.target.value as CertificateType);
              // A person who fits one type may not fit the next.
              setHolder({ ...holder, personId: null });
            }}
          >
            {CERTIFICATE_TYPES.map((key) => (
              <option key={key} value={key}>
                {t(`type.${key}`)}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-[13px] text-muted-foreground">{t(`typeHint.${type}`)}</p>
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("holderTitle")}</h2>
        <HolderFields id="certificate-holder" type={type} unit={unit} value={holder} onChange={setHolder} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("letterDetails")}</h2>
        <LetterFields id="certificate" value={letter} onChange={setLetter} />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || !ready} className="justify-self-start">
        {t("create")}
      </Button>
    </form>
  );
}

/** A draft's language, person, addressee and purpose. The type and unit stay; a new draft changes those. */
export function DraftEditor({ certificate, unit }: { certificate: CertificateDetail; unit: UnitLabel }) {
  const t = useTranslations("Certificates");
  const { status, busy, run } = useSubmit();
  const [holder, setHolder] = useState<Holder>({ unitId: unit.id, personId: certificate.person.id });
  const [letter, setLetter] = useState<Letter>({ lang: certificate.lang, addressee: certificate.addressee ?? "", purpose: certificate.purpose ?? "" });

  return (
    <Card className="grid gap-3.5">
      <h2 className="text-[15px]">{t("details")}</h2>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!holder.personId) return;
          void run(() => api.PATCH("/certificates/{id}", { params: { path: { id: certificate.id } }, body: { ...letterBody(letter), personId: holder.personId! } }));
        }}
      >
        <HolderFields id="certificate-holder" type={certificate.type} unit={unit} value={holder} onChange={setHolder} />
        <LetterFields id="certificate" value={letter} onChange={setLetter} />
        <Button type="submit" disabled={busy || !holder.personId} className="justify-self-start">
          <Save aria-hidden />
          {t("save")}
        </Button>
      </form>
      <FormStatus status={status} />
    </Card>
  );
}

/** Throwing away a draft made by mistake; it has no number, so nothing is lost. */
export function DeleteDraftCard({ certificate }: { certificate: CertificateDetail }) {
  const t = useTranslations("Certificates");
  const router = useRouter();
  const { status, run } = useSubmit();

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("deleteTitle")}</h2>
      <p className="text-[13px] text-muted-foreground">{t("deleteHint")}</p>
      <div className="justify-self-start">
        <ConfirmButton
          label={t("delete")}
          question={t("deleteConfirm")}
          icon={Trash2}
          destructive
          onConfirm={async () => {
            const done = await run(() => api.DELETE("/certificates/{id}", { params: { path: { id: certificate.id } } }));
            if (done !== undefined) router.push("/dashboard/certificates");
          }}
        />
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
