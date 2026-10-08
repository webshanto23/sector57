import { formatDate, initials, isCommitteePosition, pick, type CommitteeMember, type Locale } from "@s57/shared";
import { cn } from "cn";
import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageHeader } from "@/components/kit";
import { getCommittee } from "@/lib/api/public";
import { alternates } from "@/lib/metadata";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/committee">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Committee" });
  return { title: t("title"), alternates: alternates("/committee", locale as Locale) };
}

/** Round portrait: the photo when there is one, otherwise the initial (mockup `.av.lg`). */
function Portrait({ member, name, highlight }: { member: CommitteeMember; name: string; highlight: boolean }) {
  const frame = "size-[74px] rounded-full shadow-[0_0_0_3px_var(--surface),0_0_0_5px_var(--accent-brand-soft)]";
  if (member.photoUrl) {
    // Uploaded files come from the media CDN; Next's optimizer is not set up for it yet.
    return <Image src={member.photoUrl} alt="" width={74} height={74} unoptimized className={cn(frame, "object-cover")} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        frame,
        "grid place-items-center text-[26px] font-bold",
        highlight ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Managing committee (mockup `PUB.committee`): the members serving today. */
export default async function CommitteePage({ params }: PageProps<"/[locale]/committee">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, committee] = await Promise.all([getTranslations("Committee"), getCommittee()]);
  const sub = committee.termStart
    ? committee.termEnd
      ? t("term", { start: formatDate(committee.termStart, locale, "year"), end: formatDate(committee.termEnd, locale, "year") })
      : t("termSince", { start: formatDate(committee.termStart, locale, "year") })
    : undefined;

  return (
    <>
      <PageHeader title={t("title")} sub={sub} />
      {committee.members.length === 0 ? (
        <Card>
          <p className="text-muted-foreground">{t("empty")}</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-4">
          {committee.members.map((member, index) => {
            const name = pick(member.nameBn, member.nameEn, locale);
            return (
              <li key={member.id}>
                <Card className="grid h-full justify-items-center gap-2.5 px-3.5 py-5 text-center">
                  <Portrait member={member} name={name} highlight={index === 0} />
                  <div>
                    <h3>{name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {isCommitteePosition(member.position) ? t(`position.${member.position}`) : member.position}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {committee.members.some((member) => !member.photoUrl) ? (
        <p className="mt-2.5 text-xs text-muted-foreground">{t("photoNote")}</p>
      ) : null}
    </>
  );
}
