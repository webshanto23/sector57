import { canAnywhere, formatDate, localDigits, type FormDetail, type Locale } from "@s57/shared";
import { ChevronLeft, Download, ExternalLink, FileText, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { DecisionPanel } from "@/components/forms-admin/decision-panel";
import { FormStatusChip } from "@/components/forms-admin/labels";
import { Card, Chip, PageHeader } from "@/components/kit";
import { PartyLink, PlaceLink } from "@/components/members/labels";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getForm } from "@/lib/api/forms";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/forms/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("forms");
  const form = await getForm(id);
  return form ? { title: form.reference } : {};
}

/** A key-value list in the mockup's `.kv` style. */
function Facts({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13.5px]">
      {rows.map(([label, value], index) => (
        <div key={index} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One application: the answers, the attached documents, people already on record, and the decision. */
export default async function FormPage({ params }: PageProps<"/[locale]/dashboard/forms/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("forms");
  const [t, tForms, tMembers, form] = await Promise.all([
    getTranslations("FormsAdmin"),
    getTranslations("Forms"),
    getTranslations("Members"),
    getForm(id),
  ]);
  if (!form) notFound();
  const digits = (value: string | null) => (value ? <span className="num">{localDigits(value, locale)}</span> : "—");
  const placeOpen = form.place?.isUnit ? canAnywhere(me.access, "units") : canAnywhere(me.access, "locations");
  const nid = (value: string | null) => (form.nidHidden ? <span className="text-muted-foreground">{t("nidHidden")}</span> : digits(value));

  return (
    <>
      <PageHeader
        title={`${tForms(`kinds.${form.formKey}`)} · ${form.reference}`}
        sub={t("submittedOn", { date: formatDate(form.submittedAt, locale, "long") })}
        actions={
          <Link href="/dashboard/forms" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />

      <div className="grid content-start gap-3.5 min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-3.5">
          <Card className="grid content-start gap-3">
            <h2 className="text-[15px]">{t("answers")}</h2>
            <Answers form={form} digits={digits} nid={nid} place={form.place ? <PlaceLink place={form.place} open={placeOpen} /> : "—"} t={t} tForms={tForms} tMembers={tMembers} />
          </Card>

          <Card className="grid content-start gap-2.5">
            <h2 className="text-[15px]">{t("files")}</h2>
            {form.files.length === 0 ? <p className="text-[13px] text-muted-foreground">{t("noFiles")}</p> : null}
            {form.files.map((file) => {
              const href = `/api/forms/${form.id}/files/${file.id}`;
              const label = file.docType === "deed" || file.docType === "nid_copy" ? t(`docTypes.${file.docType}`) : file.fileName;
              return (
                <div key={file.id} className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                    <FileText className="size-4 text-primary" aria-hidden />
                    <span className="font-medium">{label}</span>
                    <a href={href} target={file.isImage ? "_blank" : undefined} rel="noopener" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {file.isImage ? <ExternalLink aria-hidden /> : <Download aria-hidden />}
                      {file.isImage ? t("openFile") : t("downloadFile")}
                    </a>
                  </div>
                  {file.isImage ? (
                    // Served by the API only to callers allowed to see the application; never cached.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={href} alt={label} className="max-h-[360px] w-auto max-w-full rounded-[8px] border border-line object-contain" />
                  ) : null}
                </div>
              );
            })}
          </Card>

          {form.matches.length > 0 && (form.status === "new" || form.status === "in_review") ? (
            <Card className="grid content-start gap-2.5">
              <h2 className="text-[15px]">{t("matches")}</h2>
              {form.matches.map((match) => (
                <p key={match.personId} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <UserRound className="size-4 text-muted-foreground" aria-hidden />
                  {match.open ? (
                    <Link href={`/dashboard/members/${match.personId}`} className="font-semibold text-fg underline-offset-2 hover:underline">
                      {match.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{match.name}</span>
                  )}
                  {match.by.map((by) => (
                    <Chip key={by} tone="info" plain>
                      {t(`matchBy.${by}`)}
                    </Chip>
                  ))}
                </p>
              ))}
              <p className="text-[12.5px] text-muted-foreground">{t("matchHint")}</p>
            </Card>
          ) : null}
        </div>

        <div className="grid content-start gap-3.5">
          <Card className="grid content-start gap-2.5">
            <h2 className="text-[15px]">{t("decision")}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <FormStatusChip status={form.status} />
              {form.membershipCode ? <Chip tone="good" plain>{t("memberNo", { no: form.membershipCode })}</Chip> : null}
            </div>
            {form.reviewedAt && form.reviewerName ? (
              <p className="text-[13px] text-muted-foreground">
                {t("decidedBy", { name: form.reviewerName, date: formatDate(form.reviewedAt, locale, "short") })}
              </p>
            ) : null}
            {form.reviewNote ? (
              <p className="rounded-[8px] bg-surface-2 px-3 py-2 text-[13.5px] whitespace-pre-line">{form.reviewNote}</p>
            ) : null}
            {form.person ? (
              <p className="flex items-center gap-2 text-[13.5px]">
                <UserRound className="size-4 text-muted-foreground" aria-hidden />
                <PartyLink party={form.person} />
              </p>
            ) : null}
          </Card>
          <DecisionPanel key={`${form.id}-${form.status}`} form={form} />
        </div>
      </div>
    </>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"FormsAdmin">>>;
type TForms = Awaited<ReturnType<typeof getTranslations<"Forms">>>;
type TMembers = Awaited<ReturnType<typeof getTranslations<"Members">>>;

/** The answers of either form as a key-value list. */
function Answers({
  form,
  digits,
  nid,
  place,
  t,
  tForms,
  tMembers,
}: {
  form: FormDetail;
  digits: (value: string | null) => ReactNode;
  nid: (value: string | null) => ReactNode;
  place: ReactNode;
  t: T;
  tForms: TForms;
  tMembers: TMembers;
}) {
  if (form.membership) {
    const { applicantKind, applicant, organisation, livesHere } = form.membership;
    return (
      <Facts
        rows={[
          [tForms("applyingAs"), tForms(`applicantKinds.${applicantKind}`)],
          ...(applicantKind === "organisation" && organisation
            ? ([
                [tForms("orgName"), organisation.name],
                [tForms("tradeLicence"), organisation.tradeLicence],
              ] as [ReactNode, ReactNode][])
            : []),
          [tForms("fullName"), applicant.fullName],
          ...(applicant.fullNameEn ? ([[tForms("fullNameEn"), applicant.fullNameEn]] as [ReactNode, ReactNode][]) : []),
          [tForms("phone"), digits(applicant.phone)],
          [tForms("nid"), nid(applicant.nid)],
          ...(applicant.email ? ([[tForms("email"), applicant.email]] as [ReactNode, ReactNode][]) : []),
          [t("place"), place],
          [t("ownerStatus"), livesHere ? tForms("livesHere") : tForms("livesElsewhere")],
        ]}
      />
    );
  }
  if (!form.renter) return null;
  const renter = form.renter;
  return (
    <div className="grid gap-3">
      <Facts
        rows={[
          [tForms("fullName"), renter.renter.fullName],
          ...(renter.renter.fullNameEn ? ([[tForms("fullNameEn"), renter.renter.fullNameEn]] as [ReactNode, ReactNode][]) : []),
          [tForms("phone"), digits(renter.renter.phone)],
          [tForms("nid"), renter.renter.nid || form.nidHidden ? nid(renter.renter.nid) : "—"],
          [tForms("renterType"), tMembers(`renterType.${renter.renterType}`)],
          [t("place"), place],
          [tForms("moveInDate"), digits(renter.moveInDate)],
          ...(renter.occupation ? ([[tForms("occupation"), renter.occupation]] as [ReactNode, ReactNode][]) : []),
          ...(renter.permanentAddress ? ([[tForms("permanentAddress"), renter.permanentAddress]] as [ReactNode, ReactNode][]) : []),
          [tForms("ownerName"), renter.owner.name],
          [tForms("ownerPhone"), digits(renter.owner.phone)],
        ]}
      />
      <div className="grid gap-1.5">
        <h3 className="text-[13.5px]">{t("household")}</h3>
        {renter.household.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("noHousehold")}</p>
        ) : (
          <ul className="grid gap-1 text-[13.5px]">
            {renter.household.map((member, index) => (
              <li key={index}>
                {member.fullName} <span className="text-muted-foreground">· {tMembers(`relation.${member.relation}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
