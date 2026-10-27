"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { EditablePage } from "@s57/shared";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useForm, type DefaultValues, type FieldValues, type Resolver, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { FormStatus } from "@/components/admin/form-status";
import { Card } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { CheckField, SectionTitle } from "../fields";
import { useSave } from "../use-save";

export type Lang = "bn" | "en";
export type Localized<T> = { bn: T; en: T };

/**
 * Form state for page content stored as `{ bn, en? }`. Both languages are always in
 * the form; English is checked and saved only while "Add English version" is on.
 * `shared` holds fields stored beside `bn`/`en` (the same in both languages).
 */
export function useLocalizedPage<T extends FieldValues>({
  slug,
  inner,
  initial,
  empty,
  shared,
}: {
  slug: EditablePage;
  inner: z.ZodType<T>;
  initial: { bn: T; en?: T } | null;
  empty: T;
  shared?: Record<string, unknown>;
}) {
  const [withEn, setWithEn] = useState(Boolean(initial?.en));
  const save = useSave();
  const schema = withEn ? z.object({ bn: inner, en: inner }) : z.object({ bn: inner });
  const form = useForm<Localized<T>>({
    // English starts as a copy of the Bangla, so numbers, dates and phones carry over.
    defaultValues: { bn: initial?.bn ?? empty, en: initial?.en ?? initial?.bn ?? empty } as DefaultValues<Localized<T>>,
    resolver: zodResolver(schema as unknown as z.ZodType<FieldValues, FieldValues>) as unknown as Resolver<Localized<T>>,
  });

  const submit = form.handleSubmit(async (values) => {
    const content = { ...shared, ...(withEn ? { bn: values.bn, en: values.en } : { bn: values.bn }) };
    await save.run(() => api.PUT("/site-pages/{slug}", { params: { path: { slug } }, body: { content } }));
  });

  return { form, withEn, setWithEn, submit, ...save };
}

/** The two language cards, the English switch and the save button around an editor's fields. */
export function LocalizedPageForm<T extends FieldValues>({
  page,
  canSave,
  fields,
  before,
}: {
  page: ReturnType<typeof useLocalizedPage<T>>;
  canSave: boolean;
  fields: (lang: Lang, form: UseFormReturn<Localized<T>>) => ReactNode;
  /** A card above the language cards, for the `shared` fields. */
  before?: ReactNode;
}) {
  const t = useTranslations("Cms.pages");
  const tAdmin = useTranslations("Admin");
  const { form, withEn, setWithEn, submit, status } = page;

  return (
    <form noValidate onSubmit={submit} className="grid gap-3.5">
      <fieldset disabled={!canSave} className="grid gap-3.5">
        {before}
        <Card className="grid gap-3.5">
          <SectionTitle title={t("bangla")} />
          {fields("bn", form)}
        </Card>
        <Card className="grid gap-3.5">
          <SectionTitle title={t("english")} sub={t("englishSub")} />
          <CheckField id="page-withEn" label={t("withEnglish")} checked={withEn} onChange={(event) => setWithEn(event.target.checked)} />
          {withEn ? fields("en", form) : null}
        </Card>
      </fieldset>
      <FormStatus status={status} />
      {canSave ? (
        <Button type="submit" disabled={form.formState.isSubmitting} className="justify-self-start">
          {form.formState.isSubmitting ? tAdmin("saving") : t("save")}
        </Button>
      ) : null}
    </form>
  );
}
