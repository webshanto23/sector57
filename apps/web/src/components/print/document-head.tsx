import { pick, type DocumentHeader, type Locale } from "@s57/shared";
import { Kantha } from "@/components/kit";
import { Logo } from "@/components/site/logo";

/**
 * The top of a receipt or a printed bill (mockup `.receipt .rh`): the society's logo
 * badge, name, address and phone from the receipt header, and what the paper is.
 */
export function DocumentHead({ header, locale, title }: { header: DocumentHeader; locale: Locale; title: string }) {
  const address = locale === "en" ? (header.addressEn ?? header.addressBn) : header.addressBn;
  return (
    <>
      <div className="bg-accent px-4 py-3.5 text-center text-accent-foreground">
        <div className="flex items-center justify-center gap-2">
          <Logo mark={header.mark} />
          <b className="text-[15px] leading-tight">{pick(header.nameBn, header.nameEn, locale)}</b>
        </div>
        {address || header.phone ? (
          <p className="num mt-1 text-[12px] opacity-90">{[address, header.phone].filter(Boolean).join(" · ")}</p>
        ) : null}
        <p className="mt-1 text-[13px] font-semibold">{title}</p>
      </div>
      <Kantha />
    </>
  );
}

/** A big slanted word across the paper: "Void", "Duplicate". */
export function Stamp({ text, tone }: { text: string; tone: "bad" | "muted" }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[6px] border-4 px-4 py-1 text-[34px] font-extrabold tracking-wider uppercase opacity-25 ${
        tone === "bad" ? "border-bad text-bad" : "border-muted-foreground text-muted-foreground"
      }`}
    >
      {text}
    </span>
  );
}
