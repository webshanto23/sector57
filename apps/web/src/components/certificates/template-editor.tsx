"use client";

import { CERTIFICATE_TEMPLATE_MAX, unknownPlaceholders, type CertificateTemplate, type CertificateTemplatesView, type CertificateType } from "@s57/shared";
import { RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { TextAreaField } from "@/components/cms/fields";
import { Card, Chip } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** The blanks a template may use, each with what it fills in. */
export function PlaceholderList({ placeholders }: { placeholders: CertificateTemplatesView["placeholders"] }) {
  const t = useTranslations("Certificates.templates");
  return (
    <dl className="grid gap-x-4 gap-y-1 text-[13px] min-[600px]:grid-cols-[max-content_1fr]">
      {placeholders.map((key) => (
        <div key={key} className="contents">
          <dt>
            <code className="rounded bg-surface-2 px-1.5 py-0.5">{`{${key}}`}</code>
          </dt>
          <dd className="text-muted-foreground">{t(`placeholder.${key}`)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One type's letter in Bangla and English; saving changes drafts and later certificates, never issued ones. */
export function TemplateCard({
  type,
  saved,
  fallback,
  customised,
  canEdit,
}: {
  type: CertificateType;
  saved: CertificateTemplate;
  fallback: CertificateTemplate;
  customised: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("Certificates");
  const { status, busy, run } = useSubmit();
  const [value, setValue] = useState<CertificateTemplate>(saved);
  const unknown = [...new Set([...unknownPlaceholders(value.bn), ...unknownPlaceholders(value.en)])];
  const unchanged = value.bn === saved.bn && value.en === saved.en;
  const isDefault = value.bn === fallback.bn && value.en === fallback.en;

  return (
    <Card className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px]">{t(`type.${type}`)}</h2>
        {customised ? (
          <Chip tone="info" plain>
            {t("templates.customised")}
          </Chip>
        ) : null}
      </div>
      <form
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.PUT("/certificates/templates", { body: { [type]: value } }));
        }}
      >
        <div className="grid gap-3 min-[900px]:grid-cols-2">
          {(["bn", "en"] as const).map((lang) => (
            <TextAreaField
              key={lang}
              id={`template-${type}-${lang}`}
              label={t(`lang.${lang}`)}
              lang={lang}
              rows={5}
              maxLength={CERTIFICATE_TEMPLATE_MAX}
              readOnly={!canEdit}
              value={value[lang]}
              onChange={(e) => setValue({ ...value, [lang]: e.target.value })}
            />
          ))}
        </div>
        {unknown.length ? <p className="text-[13px] text-bad">{t("templates.unknown", { names: unknown.map((key) => `{${key}}`).join(", ") })}</p> : null}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || unchanged || unknown.length > 0 || !value.bn.trim() || !value.en.trim()}>
              <Save aria-hidden />
              {t("save")}
            </Button>
            <Button type="button" variant="outline" disabled={isDefault} onClick={() => setValue(fallback)}>
              <RotateCcw aria-hidden />
              {t("templates.reset")}
            </Button>
          </div>
        ) : null}
      </form>
      <FormStatus status={status} />
    </Card>
  );
}
