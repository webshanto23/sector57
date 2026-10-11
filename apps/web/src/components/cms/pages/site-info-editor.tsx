"use client";

import { siteInfoSchema, type SiteInfo } from "@s57/shared";
import { useTranslations } from "next-intl";
import { TextField } from "../fields";
import { LocalizedPageForm, useLocalizedPage } from "./localized-page";

type Inner = SiteInfo["bn"];

const EMPTY: Inner = { address: "", officeHours: "", phone: "" };
// A blank optional field is "not set", not an invalid email.
const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

/** Footer and contact details shown on every public page. */
export function SiteInfoEditor({ initial, canSave }: { initial: SiteInfo | null; canSave: boolean }) {
  const t = useTranslations("Cms.pages.site");
  const page = useLocalizedPage<Inner>({ slug: "site", inner: siteInfoSchema.shape.bn, initial, empty: EMPTY });

  return (
    <LocalizedPageForm
      page={page}
      canSave={canSave}
      fields={(lang, form) => {
        const errors = form.formState.errors[lang];
        const id = (name: string) => `site-${lang}-${name}`;
        return (
          <div className="grid gap-3.5 min-[701px]:grid-cols-2">
            <TextField
              id={id("address")}
              className="min-[701px]:col-span-2"
              label={t("address")}
              lang={lang}
              error={errors?.address}
              {...form.register(`${lang}.address`)}
            />
            <TextField
              id={id("officeHours")}
              label={t("officeHours")}
              lang={lang}
              error={errors?.officeHours}
              {...form.register(`${lang}.officeHours`)}
            />
            <TextField
              id={id("phone")}
              type="tel"
              label={t("phone")}
              error={errors?.phone}
              {...form.register(`${lang}.phone`)}
            />
            <TextField
              id={id("email")}
              type="email"
              label={t("email")}
              error={errors?.email}
              {...form.register(`${lang}.email`, { setValueAs: blankToUndefined })}
            />
          </div>
        );
      }}
    />
  );
}
