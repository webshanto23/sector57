"use client";

import { CONTACT_ICONS, homeContentSchema, localDigits, type HomeContent } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { Field, inputClass } from "@/components/kit";
import { FieldMessage, TextAreaField, TextField } from "../fields";
import { HeroAlbumField, type HeroAlbumOption } from "./hero-album-field";
import { ListEditor } from "./list-editor";
import { LocalizedPageForm, useLocalizedPage, type Lang, type Localized } from "./localized-page";

type Inner = HomeContent["bn"];
type Form = UseFormReturn<Localized<Inner>>;

const EMPTY: Inner = { hero: { label: "", title: "", lead: "" }, stats: [], events: [], emergency: [] };

/** Home page: the hero slider's album, the hero, the figures under it, upcoming events and emergency contacts. */
export function HomeEditor({
  initial,
  canSave,
  albums,
}: {
  initial: HomeContent | null;
  canSave: boolean;
  albums: HeroAlbumOption[] | null;
}) {
  const [heroAlbumId, setHeroAlbumId] = useState(initial?.heroAlbumId);
  const page = useLocalizedPage<Inner>({
    slug: "home",
    inner: homeContentSchema.shape.bn,
    initial,
    empty: EMPTY,
    shared: { heroAlbumId },
  });
  return (
    <LocalizedPageForm
      page={page}
      canSave={canSave}
      before={<HeroAlbumField albums={albums} value={heroAlbumId} onChange={setHeroAlbumId} />}
      fields={(lang, form) => <HomeFields lang={lang} form={form} />}
    />
  );
}

function HomeFields({ lang, form }: { lang: Lang; form: Form }) {
  const t = useTranslations("Cms.pages.home");
  const locale = useLocale();
  const errors = form.formState.errors[lang];
  const id = (name: string) => `home-${lang}-${name}`;
  const n = (index: number) => localDigits(index + 1, locale === "en" ? "en" : "bn");
  const stats = useFieldArray({ control: form.control, name: `${lang}.stats` });
  const events = useFieldArray({ control: form.control, name: `${lang}.events` });
  const emergency = useFieldArray({ control: form.control, name: `${lang}.emergency` });

  return (
    <div className="grid gap-5">
      <section className="grid gap-3.5" aria-label={t("hero")}>
        <h3 className="text-[13.5px] font-semibold">{t("hero")}</h3>
        <div className="grid gap-3.5 min-[701px]:grid-cols-2">
          <TextField id={id("label")} label={t("heroLabel")} lang={lang} error={errors?.hero?.label} {...form.register(`${lang}.hero.label`)} />
          <TextField id={id("title")} label={t("heroTitle")} lang={lang} error={errors?.hero?.title} {...form.register(`${lang}.hero.title`)} />
          <TextAreaField
            id={id("lead")}
            className="min-[701px]:col-span-2"
            label={t("heroLead")}
            lang={lang}
            rows={3}
            error={errors?.hero?.lead}
            {...form.register(`${lang}.hero.lead`)}
          />
        </div>
      </section>

      <ListEditor
        title={t("stats")}
        items={stats.fields}
        max={6}
        onAdd={() => stats.append({ label: "", value: "" })}
        onRemove={stats.remove}
        onMove={stats.move}
        rowLabel={(index) => t("statN", { n: n(index) })}
        row={(index) => (
          <div className="grid gap-2.5 min-[600px]:grid-cols-[2fr_1fr]">
            <TextField
              id={id(`stat-${index}-label`)}
              label={t("statLabel")}
              lang={lang}
              error={errors?.stats?.[index]?.label}
              {...form.register(`${lang}.stats.${index}.label`)}
            />
            <TextField
              id={id(`stat-${index}-value`)}
              label={t("statValue")}
              error={errors?.stats?.[index]?.value}
              {...form.register(`${lang}.stats.${index}.value`)}
            />
          </div>
        )}
      />

      <ListEditor
        title={t("events")}
        items={events.fields}
        max={6}
        onAdd={() => events.append({ date: "", title: "", place: "" })}
        onRemove={events.remove}
        onMove={events.move}
        rowLabel={(index) => t("eventN", { n: n(index) })}
        row={(index) => (
          <div className="grid gap-2.5 min-[600px]:grid-cols-[1fr_2fr_2fr]">
            <TextField
              id={id(`event-${index}-date`)}
              type="date"
              label={t("eventDate")}
              error={errors?.events?.[index]?.date}
              {...form.register(`${lang}.events.${index}.date`)}
            />
            <TextField
              id={id(`event-${index}-title`)}
              label={t("eventTitle")}
              lang={lang}
              error={errors?.events?.[index]?.title}
              {...form.register(`${lang}.events.${index}.title`)}
            />
            <TextField
              id={id(`event-${index}-place`)}
              label={t("eventPlace")}
              lang={lang}
              error={errors?.events?.[index]?.place}
              {...form.register(`${lang}.events.${index}.place`)}
            />
          </div>
        )}
      />

      <ListEditor
        title={t("emergency")}
        items={emergency.fields}
        max={8}
        onAdd={() => emergency.append({ label: "", phone: "", icon: "phone" })}
        onRemove={emergency.remove}
        onMove={emergency.move}
        rowLabel={(index) => t("contactN", { n: n(index) })}
        row={(index) => (
          <div className="grid gap-2.5 min-[600px]:grid-cols-[2fr_1.5fr_1fr]">
            <TextField
              id={id(`contact-${index}-label`)}
              label={t("contactLabel")}
              lang={lang}
              error={errors?.emergency?.[index]?.label}
              {...form.register(`${lang}.emergency.${index}.label`)}
            />
            <TextField
              id={id(`contact-${index}-phone`)}
              type="tel"
              label={t("contactPhone")}
              error={errors?.emergency?.[index]?.phone}
              {...form.register(`${lang}.emergency.${index}.phone`)}
            />
            <div>
              <Field label={t("contactIcon")} htmlFor={id(`contact-${index}-icon`)}>
                <select id={id(`contact-${index}-icon`)} className={inputClass} {...form.register(`${lang}.emergency.${index}.icon`)}>
                  {CONTACT_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {t(`icons.${icon}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <FieldMessage id={id(`contact-${index}-icon`)} error={errors?.emergency?.[index]?.icon} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
