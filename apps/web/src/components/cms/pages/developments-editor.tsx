"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ART_SCENES, developmentsContentSchema, localDigits, PROJECT_STATUSES, type DevelopmentsContent } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useFieldArray, useForm } from "react-hook-form";
import type { z } from "zod";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { FieldMessage, SectionTitle, TextAreaField, TextField } from "../fields";
import { useSave } from "../use-save";
import { ListEditor } from "./list-editor";

type FormInput = z.input<typeof developmentsContentSchema>;
type FormOutput = z.output<typeof developmentsContentSchema>;

// Optional English text: blank means "not set", so the site falls back to the Bangla.
const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

/**
 * Development projects. Each field has its own optional English version; budget and
 * spent are display figures in taka (typed as decimal text, never floats).
 */
export function DevelopmentsEditor({ initial, canSave }: { initial: DevelopmentsContent | null; canSave: boolean }) {
  const t = useTranslations("Cms.pages.developments");
  const tStatus = useTranslations("Developments.status");
  const tAdmin = useTranslations("Admin");
  const locale = useLocale();
  const { status, run } = useSave();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(developmentsContentSchema),
    defaultValues: initial ?? { projects: [] },
  });
  const projects = useFieldArray({ control: form.control, name: "projects" });
  const errors = form.formState.errors.projects;
  const id = (index: number, name: string) => `project-${index}-${name}`;

  return (
    <form
      noValidate
      className="grid gap-3.5"
      onSubmit={form.handleSubmit((content) =>
        run(() => api.PUT("/site-pages/{slug}", { params: { path: { slug: "developments" } }, body: { content } })),
      )}
    >
      <Card className="grid gap-3.5">
        <SectionTitle title={t("title")} sub={t("sub")} />
        <fieldset disabled={!canSave} className="grid gap-3.5">
          <ListEditor
            title={t("projects")}
            items={projects.fields}
            max={50}
            onAdd={() =>
              projects.append({
                titleBn: "",
                descriptionBn: "",
                status: "planned",
                progress: 0,
                budget: "0",
                spent: "0",
                art: "road",
              })
            }
            onRemove={projects.remove}
            onMove={projects.move}
            rowLabel={(index) => t("projectN", { n: localDigits(index + 1, locale === "en" ? "en" : "bn") })}
            row={(index) => (
              <div className="grid gap-2.5 min-[701px]:grid-cols-2">
                <TextField
                  id={id(index, "titleBn")}
                  label={t("titleBn")}
                  error={errors?.[index]?.titleBn}
                  {...form.register(`projects.${index}.titleBn`)}
                />
                <TextField
                  id={id(index, "titleEn")}
                  label={t("titleEn")}
                  lang="en"
                  error={errors?.[index]?.titleEn}
                  {...form.register(`projects.${index}.titleEn`, { setValueAs: blankToUndefined })}
                />
                <TextAreaField
                  id={id(index, "descriptionBn")}
                  label={t("descriptionBn")}
                  rows={3}
                  error={errors?.[index]?.descriptionBn}
                  {...form.register(`projects.${index}.descriptionBn`)}
                />
                <TextAreaField
                  id={id(index, "descriptionEn")}
                  label={t("descriptionEn")}
                  lang="en"
                  rows={3}
                  error={errors?.[index]?.descriptionEn}
                  {...form.register(`projects.${index}.descriptionEn`, { setValueAs: blankToUndefined })}
                />
                <div className="grid gap-2.5 min-[600px]:grid-cols-2 min-[701px]:col-span-2 min-[1100px]:grid-cols-5">
                  <div>
                    <Field label={t("status")} htmlFor={id(index, "status")}>
                      <select id={id(index, "status")} className={inputClass} {...form.register(`projects.${index}.status`)}>
                        {PROJECT_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {tStatus(value)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <TextField
                    id={id(index, "progress")}
                    type="number"
                    min={0}
                    max={100}
                    label={t("progress")}
                    error={errors?.[index]?.progress}
                    {...form.register(`projects.${index}.progress`, { valueAsNumber: true })}
                  />
                  <TextField
                    id={id(index, "budget")}
                    inputMode="decimal"
                    label={t("budget")}
                    error={errors?.[index]?.budget}
                    {...form.register(`projects.${index}.budget`)}
                  />
                  <TextField
                    id={id(index, "spent")}
                    inputMode="decimal"
                    label={t("spent")}
                    error={errors?.[index]?.spent}
                    {...form.register(`projects.${index}.spent`)}
                  />
                  <div>
                    <Field label={t("art")} htmlFor={id(index, "art")}>
                      <select id={id(index, "art")} className={inputClass} {...form.register(`projects.${index}.art`)}>
                        {ART_SCENES.map((scene) => (
                          <option key={scene} value={scene}>
                            {t(`arts.${scene}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <FieldMessage id={id(index, "art")} error={errors?.[index]?.art} />
                  </div>
                </div>
              </div>
            )}
          />
        </fieldset>
      </Card>
      <FormStatus status={status} />
      {canSave ? (
        <Button type="submit" disabled={form.formState.isSubmitting} className="justify-self-start">
          {form.formState.isSubmitting ? tAdmin("saving") : t("save")}
        </Button>
      ) : null}
    </form>
  );
}
