import { formatDate, type CertificatePrint } from "@s57/shared";
import { DocumentHead, Stamp } from "@/components/print/document-head";

/** The words on the paper, in the letter's own language (not the dashboard's). */
export type LetterLabels = { title: string; no: string; date: string; to: string; subject: string; signature: string; void: string };

/**
 * An issued certificate on A4: the society's header, number and date, the addressee and
 * subject, the frozen text, and the signer under a line for the wet signature. "Void" across a
 * voided one. No hooks, so a server page renders it with the letter's language.
 */
export function CertificateLetter({ print, labels }: { print: CertificatePrint; labels: LetterLabels }) {
  return (
    <article lang={print.lang} className="relative grid content-start overflow-hidden rounded-[12px] border border-line bg-surface text-fg print:rounded-none print:border-0">
      <DocumentHead header={print.header} locale={print.lang} title={labels.title} />
      <div className="grid gap-5 px-8 py-6 text-[11.5pt] leading-relaxed">
        <div className="flex flex-wrap justify-between gap-2">
          <p>
            {labels.no}: <b className="num">{print.certNo}</b>
          </p>
          <p>
            {labels.date}: <b className="num">{formatDate(print.issuedOn, print.lang)}</b>
          </p>
        </div>
        {print.addressee ? (
          <p className="whitespace-pre-line">
            {labels.to}
            <br />
            {print.addressee}
          </p>
        ) : null}
        {print.purpose ? (
          <p>
            <b>{labels.subject}:</b> {print.purpose}
          </p>
        ) : null}
        <p className="whitespace-pre-line text-justify">{print.body}</p>
        <div className="mt-14 grid justify-items-end text-end">
          <div className="grid min-w-[200px] gap-0.5 border-t border-fg pt-1.5 text-center">
            <span className="text-[10pt] text-muted-foreground">{labels.signature}</span>
            <b>{print.signerName}</b>
            {print.signerTitle ? <span>{print.signerTitle}</span> : null}
            <span>{print.society}</span>
          </div>
        </div>
      </div>
      {print.status === "void" ? <Stamp text={labels.void} tone="bad" /> : null}
    </article>
  );
}
