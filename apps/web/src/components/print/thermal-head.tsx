import { pick, type DocumentHeader, type Locale } from "@s57/shared";

/**
 * The top of a thermal receipt or bill: the badge as an outlined circle (a colour badge
 * prints as grey dots), the society's name, address and phone, and what the paper is.
 */
export function ThermalHead({ header, locale, title }: { header: DocumentHeader; locale: Locale; title: string }) {
  const address = locale === "en" ? (header.addressEn ?? header.addressBn) : header.addressBn;
  return (
    <div className="grid justify-items-center gap-[0.8mm] text-center">
      <span aria-hidden className="grid size-[9mm] place-items-center rounded-full border-2 border-foreground text-[10pt] font-bold">
        {header.mark}
      </span>
      <b className="text-[11pt] leading-tight">{pick(header.nameBn, header.nameEn, locale)}</b>
      {address ? <span>{address}</span> : null}
      {header.phone ? <span className="num">{header.phone}</span> : null}
      <b className="mt-[1mm] text-[11pt] tracking-wide uppercase">{title}</b>
    </div>
  );
}

/** "Label ........ value" on one line, the value kept whole. */
export function ThermalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={`flex items-baseline justify-between gap-[2mm] ${strong ? "text-[11pt] font-bold" : ""}`}>
      <span className="min-w-0">{label}</span>
      <span className="num whitespace-nowrap">{value}</span>
    </p>
  );
}
