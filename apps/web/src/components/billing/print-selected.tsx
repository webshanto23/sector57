"use client";

import { localDigits, MAX_PRINT_BILLS, type Locale } from "@s57/shared";
import { Banknote, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/** The visible tick boxes of the bills list (the table and the phone cards each have one per bill). */
const boxes = (formId: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="id"]`)].filter((box) => box.offsetParent !== null);

type Ticked = { id: string; account: string; open: boolean };

const tickedBills = (formId: string): Ticked[] => {
  const seen = new Map<string, Ticked>();
  for (const box of boxes(formId)) {
    if (box.checked) seen.set(box.value, { id: box.value, account: box.dataset.account ?? "", open: box.dataset.open === "1" });
  }
  return [...seen.values()];
};

/**
 * "Print selected" for the bills list: a GET form that the rows' tick boxes join through
 * their `form` attribute, so the ticked bills open together on the print page. With
 * `canCollect`, "Take payment" opens the collect page with the ticked bills ticked there;
 * one receipt is for one unit or member, so it needs open bills of a single account.
 */
export function PrintSelected({ formId, action, canCollect = false }: { formId: string; action: string; canCollect?: boolean }) {
  const t = useTranslations("Billing.printMany");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [ticked, setTicked] = useState<Ticked[]>([]);
  const count = ticked.length;

  useEffect(() => {
    const update = () => setTicked(tickedBills(formId));
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);

  function selectAll() {
    const visible = boxes(formId);
    const all = visible.every((box) => box.checked);
    for (const box of visible) box.checked = !all;
    setTicked(tickedBills(formId));
  }

  const accounts = new Set(ticked.map((bill) => bill.account));
  const collectProblem =
    count === 0 ? null : ticked.some((bill) => !bill.open) ? t("collectClosed") : accounts.size > 1 ? t("collectMixed") : null;

  function collect() {
    const [key, id] = [...accounts][0]?.split(":") ?? [];
    if (!key || !id || collectProblem) return;
    router.push({ pathname: "/dashboard/collect", query: { [key]: id, invoiceId: ticked.map((bill) => bill.id) } });
  }

  return (
    <form id={formId} method="get" action={action} className="mb-2.5 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={selectAll}>
        {t("selectAll")}
      </Button>
      <Button type="submit" variant="outline" size="sm" disabled={count === 0 || count > MAX_PRINT_BILLS}>
        <Printer aria-hidden />
        {t("selected")}
        {count ? ` (${localDigits(count, locale)})` : ""}
      </Button>
      {canCollect ? (
        <>
          <Button type="button" size="sm" disabled={count === 0 || Boolean(collectProblem)} onClick={collect}>
            <Banknote aria-hidden />
            {t("collect")}
          </Button>
          {collectProblem ? <span className="text-[12.5px] text-muted-foreground">{collectProblem}</span> : null}
        </>
      ) : null}
    </form>
  );
}
