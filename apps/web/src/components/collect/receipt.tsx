import { amountInWords, formatDate, formatTaka, localDigits, pick, type DocumentHeader, type Locale, type PaymentDetail, type PaymentMethod } from "@s57/shared";
import { useTranslations } from "next-intl";
import { DocumentHead, Stamp } from "@/components/print/document-head";

/** What a receipt shows. The live preview fills it before there is a receipt number. */
export type ReceiptData = {
  /** A receipt for bills, or for a donation (titled and laid out as one). */
  kind: "bills" | "donation";
  header: DocumentHeader;
  receiptNo: string | null;
  /** A day (`YYYY-MM-DD`) or an instant. */
  date: string;
  /** Null for an anonymous donor. */
  payer: { name: string; nameEn: string | null; memberNo: number | null } | null;
  unit: { name: string; address: string[] } | null;
  /** `invoiceNo` is null on a donation's line; `detail` (the fund) is printed under the label instead. */
  items: { key: string; label: string; invoiceNo: string | null; detail?: string | null; amount: string; total: string }[];
  amount: string;
  method: PaymentMethod;
  /** The cheque number, or the wallet and transaction ID. */
  methodRef: string | null;
  collectedBy: string;
  note: string | null;
  mark: "duplicate" | "void" | null;
};

/** A saved receipt as `Receipt` shows it. */
export function receiptOf(
  payment: PaymentDetail,
  locale: Locale,
  mark: ReceiptData["mark"],
  donationLabel: (purpose: string | null) => string = (purpose) => purpose ?? "",
): ReceiptData {
  const donation = payment.donation;
  return {
    kind: donation ? "donation" : "bills",
    header: payment.header,
    receiptNo: payment.receiptNo,
    date: payment.receivedAt,
    payer: payment.payer,
    unit: payment.payer?.unit ?? null,
    items: donation
      ? [
          {
            key: donation.id,
            label: donationLabel(donation.purpose),
            invoiceNo: null,
            detail: pick(donation.fund.nameBn, donation.fund.nameEn, locale),
            amount: payment.amount,
            total: payment.amount,
          },
        ]
      : payment.allocations.map((allocation) => ({
          key: allocation.invoiceId,
          label: allocation.lines.map((line) => pick(line.description, line.descriptionEn, locale)).join(", "),
          invoiceNo: allocation.invoiceNo,
          amount: allocation.amount,
          total: allocation.total,
        })),
    amount: payment.amount,
    method: payment.method,
    methodRef: payment.methodRef,
    collectedBy: payment.collectedBy.name,
    note: payment.note,
    mark: payment.voided ? "void" : mark,
  };
}

/** A donation's line on the receipt: "Donation" and its purpose, if any. */
export function donationLine(t: (key: "donation" | "donationFor", values?: { purpose: string }) => string, purpose: string | null): string {
  return purpose ? t("donationFor", { purpose }) : t("donation");
}

/**
 * The mockup's receipt card. `print` lays it out for A5 paper: the payer's copy, a cut line,
 * and the office counterfoil with a signature line.
 */
export function Receipt({ data, locale, print = false }: { data: ReceiptData; locale: Locale; print?: boolean }) {
  const t = useTranslations("Collect.receipt");
  const tc = useTranslations("Collect");
  const tMethod = useTranslations("Finance.method");
  const paidBy = [tMethod(data.method), data.methodRef].filter(Boolean).join(" · ");
  const no = data.receiptNo ?? "—";
  const day = formatDate(data.date, locale);
  const payer = data.payer ? pick(data.payer.name, data.payer.nameEn, locale) : t("anonymous");
  const unit = data.unit ? [data.unit.name, ...[...data.unit.address].reverse()].join(", ") : null;
  const member = data.payer && data.payer.memberNo !== null ? localDigits(tc("memberNo", { no: data.payer.memberNo }), locale) : null;
  const title = data.kind === "donation" ? t("donationTitle") : t("title");
  const words = amountInWords(data.amount, locale);
  const stamp = data.mark === "void" ? <Stamp text={t("void")} tone="bad" /> : data.mark === "duplicate" ? <Stamp text={t("duplicate")} tone="muted" /> : null;

  const body = (
    <div className="grid gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <span>
          {t("no")} <b className="font-mono">{no}</b>
        </span>
        <span className="num">{day}</span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13.5px]">
        <dt className="text-muted-foreground">{t("from")}</dt>
        <dd className="font-medium">
          {payer}
          {member ? <span className="font-normal text-muted-foreground"> · {member}</span> : null}
        </dd>
        {unit ? (
          <>
            <dt className="text-muted-foreground">{t("unit")}</dt>
            <dd>{unit}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t("for")}</dt>
        <dd>
          <ul className="grid gap-1">
            {data.items.map((item) => (
              <li key={item.key} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  {item.label}
                  {item.invoiceNo ? (
                    <span className="block font-mono text-[11.5px] text-muted-foreground">
                      {t("bill", { no: item.invoiceNo })}
                      {item.amount !== item.total ? ` · ${t("part", { total: formatTaka(item.total, locale) })}` : null}
                    </span>
                  ) : item.detail ? (
                    <span className="block text-[11.5px] text-muted-foreground">{item.detail}</span>
                  ) : null}
                </span>
                <span className="num whitespace-nowrap">{formatTaka(item.amount, locale)}</span>
              </li>
            ))}
          </ul>
        </dd>
      </dl>
      <div className="flex items-center justify-between gap-3 border-y border-dashed border-line py-2 font-semibold">
        <span className="min-w-0">{t("words", { words })}</span>
        <span className="num text-lg whitespace-nowrap">{formatTaka(data.amount, locale)}</span>
      </div>
      {data.note ? <p className="text-[12.5px] text-muted-foreground">{t("note", { note: data.note })}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
        <span>{t("collectedBy", { name: data.collectedBy })}</span>
        <span>{paidBy}</span>
      </div>
    </div>
  );

  if (!print) {
    return (
      <div className="relative overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
        <DocumentHead header={data.header} locale={locale} title={title} />
        {body}
        {stamp}
      </div>
    );
  }

  return (
    <div className="grid gap-0">
      <div className="print-break-avoid relative overflow-hidden rounded-[8px] border border-line">
        <DocumentHead header={data.header} locale={locale} title={title} />
        {body}
        <div className="flex items-end justify-between gap-4 px-4 pb-3 text-[11.5px] text-muted-foreground">
          <span>{t("payerCopy")}</span>
          <span className="border-t border-line pt-1">{t("signature")}</span>
        </div>
        {stamp}
      </div>

      <p className="my-3 flex items-center gap-2 text-[10.5px] text-muted-foreground" aria-hidden>
        <span className="h-0 flex-1 border-t border-dashed border-muted-foreground" />✂ {t("cut")}
        <span className="h-0 flex-1 border-t border-dashed border-muted-foreground" />
      </p>

      <div className="print-break-avoid relative grid gap-1.5 overflow-hidden rounded-[8px] border border-line px-4 py-3 text-[12px]">
        <div className="flex items-center justify-between gap-2 font-semibold">
          <span>
            {t("officeCopy")} · {pick(data.header.nameBn, data.header.nameEn, locale)}
          </span>
          <span className="font-mono">{no}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <span>
            {t("from")}: {payer}
          </span>
          <span className="num text-right">{day}</span>
          <span className="col-span-2">{unit ?? member}</span>
          <span className={`col-span-2 text-[11px] ${data.kind === "bills" ? "font-mono" : ""}`}>
            {data.items.map((item) => item.invoiceNo ?? [item.label, item.detail].filter(Boolean).join(" · ")).join(", ")}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-dashed border-line pt-1.5 font-semibold">
          <span>{t("collectedBy", { name: data.collectedBy })}</span>
          <span className="num text-[14px]">{formatTaka(data.amount, locale)}</span>
        </div>
        <span className="text-[11px]">{paidBy}</span>
        <div className="flex justify-end pt-3 text-[11px] text-muted-foreground">
          <span className="border-t border-line pt-1">{t("signature")}</span>
        </div>
        {stamp}
      </div>
    </div>
  );
}
