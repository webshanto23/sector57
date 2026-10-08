import { formatTaka, pick, type Locale, type ProjectStatus } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, Chip, PageHeader, ProgressBar, type Tone } from "@/components/kit";
import { Art } from "@/components/site/art";
import { getDevelopments } from "@/lib/api/public";
import { alternates } from "@/lib/metadata";

export const revalidate = 60;

const STATUS_TONE: Record<ProjectStatus, Tone> = { planned: "neutral", in_progress: "warn", completed: "good" };

export async function generateMetadata({ params }: PageProps<"/[locale]/developments">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Developments" });
  return { title: t("title"), description: t("sub"), alternates: alternates("/developments", locale as Locale) };
}

/** Development projects (mockup `PUB.developments`): progress and money per project. */
export default async function DevelopmentsPage({ params }: PageProps<"/[locale]/developments">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, content] = await Promise.all([getTranslations("Developments"), getDevelopments()]);
  const projects = content?.projects ?? [];

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      {projects.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t("empty")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 min-[701px]:grid-cols-2">
          {projects.map((project, index) => {
            const title = pick(project.titleBn, project.titleEn, locale);
            return (
              <Card key={`${index}-${project.titleBn}`} className="grid content-start gap-2.5 p-2.5 min-[600px]:p-2.5">
                <Art scene={project.art} seed={project.progress + 5} ratio={[16, 7]} className="rounded-[8px]" />
                <div className="grid gap-2.5 px-1.5 pt-1 pb-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3>{title}</h3>
                    <Chip tone={STATUS_TONE[project.status]}>{t(`status.${project.status}`)}</Chip>
                  </div>
                  <p className="text-xs text-muted-foreground">{pick(project.descriptionBn, project.descriptionEn, locale)}</p>
                  <ProgressBar value={project.progress} tone={project.progress === 100 ? "good" : "acc"} label={title} />
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
                    <dt className="text-muted-foreground">{t("budget")}</dt>
                    <dd className="font-medium">{formatTaka(project.budget, locale)}</dd>
                    <dt className="text-muted-foreground">{t("spent")}</dt>
                    <dd className="font-medium">{formatTaka(project.spent, locale)}</dd>
                  </dl>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
