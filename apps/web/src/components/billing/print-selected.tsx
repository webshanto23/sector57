"use client";

import { localDigits, MAX_PRINT_BILLS, type Locale } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** The visible tick boxes of the bills list (the table and the phone cards each have one per bill). */
const boxes = (formId: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="id"]`)].filter((box) => box.offsetParent !== null);

/**
 * "Print selected" for the bills list: a GET form that the rows' tick boxes join through
 * their `form` attribute, so the ticked bills open together on the print page.
 */
export function PrintSelected({ formId, action }: { formId: string; action: string }) {
  const t = useTranslations("Billing.printMany");
  const locale = useLocale() as Locale;
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(new Set(boxes(formId).filter((box) => box.checked).map((box) => box.value)).size);
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);

  function selectAll() {
    const visible = boxes(formId);
    const all = visible.every((box) => box.checked);
    for (const box of visible) box.checked = !all;
    setCount(all ? 0 : new Set(visible.map((box) => box.value)).size);
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
    </form>
  );
}
