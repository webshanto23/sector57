"use client";

import { formatDate, pick, type Locale, type MemberCard } from "@s57/shared";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Logo } from "@/components/site/logo";

// The card keeps the flag colours on purpose (as the logo does): it looks the same in dark mode
// and on paper. Sizes are in millimetres: a CR80 card standing up, 54 × 85.6 mm.
const BAND = "bg-[linear-gradient(135deg,#00513b,#006a4e_55%,#0a8a5f)] text-white";
const STITCH = "h-[0.7mm] bg-[repeating-linear-gradient(90deg,#c42136_0_1.6mm,transparent_1.6mm_2.4mm)]";
const DOTS = "bg-[#f6f7f3] bg-[radial-gradient(#dfe5dc_0.25mm,transparent_0.3mm)] bg-size-[2.6mm_2.6mm]";

/** One face of the card, at its real size. */
function Face({ children }: { children: ReactNode }) {
  return (
    <div className={`relative flex h-[85.6mm] w-[54mm] flex-none flex-col overflow-hidden rounded-[3mm] text-[#111814] ${DOTS}`}>{children}</div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className={`flex items-center justify-between gap-[2mm] px-[3.5mm] py-[2mm] text-[5.5pt] ${BAND}`}>{children}</div>;
}

/** The front (mockup `sector57-member-id-card-gradient-filled-both.png`): society band, photo, name, membership ID, contact, dates. */
export function IdCardFront({ card }: { card: MemberCard }) {
  const t = useTranslations("Members.idCard");
  const locale = useLocale() as Locale;
  const { header } = card;
  const place = locale === "en" ? (header.addressEn ?? header.addressBn) : header.addressBn;
  const second = locale === "en" ? null : card.nameEn;

  return (
    <Face>
      <div className={`grid justify-items-center gap-[0.8mm] px-[3mm] pt-[3mm] pb-[2.5mm] text-center ${BAND}`}>
        <span className="flex rounded-[2mm] border-[0.5mm] border-white/85 p-[0.6mm]">
          <Logo mark={header.mark} />
        </span>
        <p className="text-[8pt] leading-tight font-bold">{pick(header.nameBn, header.nameEn, locale)}</p>
        {place ? <p className="text-[5pt] leading-tight opacity-90">{place}</p> : null}
        <p className="text-[5pt] font-bold tracking-[0.25em] uppercase">{t("memberCard")}</p>
      </div>
      <div className={STITCH} />

      <div className="grid justify-items-center gap-[1.2mm] px-[3.5mm] pt-[3mm] text-center">
        <div className="relative h-[24mm] w-[19mm] overflow-hidden rounded-[1.5mm] border-[0.6mm] border-white bg-[#e2efe8] shadow-[0_0.3mm_1mm_rgba(0,0,0,0.15)]">
          {card.photoUrl ? (
            <Image src={card.photoUrl} alt="" fill unoptimized className="object-cover" />
          ) : card.kind === "organisation" ? (
            <span className="grid size-full place-items-center">
              <Logo mark={header.mark} size="lg" />
            </span>
          ) : (
            <span aria-hidden className="absolute inset-x-[2.5mm] bottom-0 top-[3mm] grid justify-items-center">
              <span className="size-[8mm] rounded-full bg-[#9ec6b5]" />
              <span className="mt-[1mm] h-[9mm] w-full rounded-t-full bg-[#9ec6b5]" />
            </span>
          )}
        </div>
        <div>
          <p className="text-[9pt] leading-tight font-bold">{card.name}</p>
          {second ? <p className="text-[6pt] leading-tight text-[#4a544d]">{second}</p> : null}
        </div>
        <p className="flex items-baseline gap-[1.5mm] rounded-[1.2mm] bg-[#006a4e] px-[2.5mm] py-[1mm] text-white">
          <span className="text-[4.5pt] tracking-[0.12em] uppercase">{t("membershipId")}</span>
          <span className="font-mono text-[8pt] font-bold">{card.membershipCode}</span>
        </p>
        {card.phone || card.email ? (
          <dl className="grid w-full grid-cols-[auto_1fr] gap-x-[2mm] gap-y-[0.5mm] rounded-[1.5mm] bg-white px-[2.5mm] py-[1.5mm] text-left text-[5.5pt]">
            {card.phone ? (
              <>
                <dt className="tracking-[0.08em] text-[#4a544d] uppercase">{t("phone")}</dt>
                <dd className="font-mono">{card.phone}</dd>
              </>
            ) : null}
            {card.email ? (
              <>
                <dt className="tracking-[0.08em] text-[#4a544d] uppercase">{t("email")}</dt>
                <dd className="truncate">{card.email}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </div>

      <div className="flex-1" />
      <Footer>
        <span>{t("since", { date: formatDate(card.joinedOn, locale, "short") })}</span>
        {card.validTill ? <b>{t("validTill", { date: formatDate(card.validTill, locale, "short") })}</b> : null}
      </Footer>
    </Face>
  );
}

/** The back: the society's name in both languages, the terms, the signature lines and the office contact. */
export function IdCardBack({ card }: { card: MemberCard }) {
  const t = useTranslations("Members.idCard");
  const locale = useLocale() as Locale;
  const { header, settings } = card;
  const typed = locale === "en" && settings.termsEn.length ? settings.termsEn : settings.termsBn;
  const terms = typed.length ? typed : [t("terms.one"), t("terms.two"), t("terms.three")];
  const signature = (locale === "en" ? (settings.signatureEn ?? settings.signatureBn) : settings.signatureBn) ?? t("secretary");
  const contact = [header.phone, header.email].filter(Boolean).join(" · ");

  return (
    <Face>
      <div className={`grid gap-[0.5mm] px-[3mm] pt-[3mm] pb-[2.5mm] text-center ${BAND}`}>
        <p className="text-[7.5pt] leading-tight font-bold">{header.nameEn ?? header.nameBn}</p>
        {header.nameEn ? <p className="text-[6pt] leading-tight">{header.nameBn}</p> : null}
      </div>
      <div className={STITCH} />

      <div className="mx-[3mm] mt-[4mm] rounded-[1.5mm] bg-white px-[2.5mm] py-[2mm]">
        <p className="text-[5.5pt] font-bold tracking-[0.12em] text-[#006a4e] uppercase">{t("termsTitle")}</p>
        <ol className="mt-[1mm] list-decimal pl-[3mm] text-[5.5pt] leading-snug">
          {terms.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </div>

      <div className="mt-auto grid grid-cols-[1fr_auto_1fr] items-end gap-[2mm] px-[3mm] pb-[3mm] text-center text-[5pt] text-[#4a544d]">
        <p className="border-t-[0.25mm] border-[#4a544d] pt-[0.8mm]">{t("memberSignature")}</p>
        <span className="grid size-[11mm] place-items-center rounded-full border-[0.3mm] border-dashed border-[#006a4e] text-[4.5pt] tracking-[0.1em] text-[#006a4e] uppercase">
          {t("seal")}
        </span>
        <p className="border-t-[0.25mm] border-[#4a544d] pt-[0.8mm]">{signature}</p>
      </div>

      <Footer>
        <span className="truncate">{contact}</span>
        <b className="font-mono">{card.membershipCode}</b>
      </Footer>
    </Face>
  );
}
