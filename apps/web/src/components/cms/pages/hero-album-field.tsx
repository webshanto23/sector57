"use client";

import { HERO_SLIDES_MAX, localDigits, pick } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { Card, Field, inputClass } from "@/components/kit";
import { SectionTitle } from "../fields";

export type HeroAlbumOption = { id: string; titleBn: string; titleEn: string | null; isPublished: boolean; photoCount: number };

/**
 * Picks the gallery album the home page slider shows. `albums` is null when the
 * user can't see the gallery: the current choice is then kept but can't be changed.
 */
export function HeroAlbumField({
  albums,
  value,
  onChange,
}: {
  albums: HeroAlbumOption[] | null;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const t = useTranslations("Cms.pages.home");
  const locale = useLocale() === "en" ? "en" : "bn";
  const selected = albums?.find((album) => album.id === value);

  return (
    <Card className="grid gap-3.5">
      <SectionTitle title={t("heroAlbum")} sub={t("heroAlbumSub", { max: localDigits(HERO_SLIDES_MAX, locale) })} />
      {albums ? (
        <Field label={t("heroAlbumLabel")} htmlFor="home-heroAlbum">
          <select
            id="home-heroAlbum"
            className={inputClass}
            value={value ?? ""}
            onChange={(event) => onChange(event.target.value || undefined)}
          >
            <option value="">{t("heroAlbumNone")}</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {t("heroAlbumOption", {
                  title: pick(album.titleBn, album.titleEn, locale),
                  count: localDigits(album.photoCount, locale),
                  draft: album.isPublished ? "no" : "yes",
                })}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("heroAlbumNoAccess")}</p>
      )}
      {selected && !selected.isPublished ? <p className="text-[13px] text-warn">{t("heroAlbumDraft")}</p> : null}
    </Card>
  );
}
