"use client";

import { localDigits, type Locale } from "@s57/shared";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import { FormStatus, type Status } from "@/components/admin/form-status";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

/** The tick boxes on a place page's cards that belong to this group. */
const boxes = (group: string) => [...document.querySelectorAll<HTMLInputElement>(`input[data-pick="${group}"]`)];

/**
 * "Select all" and "Remove selected" for the cards inside a place (floors, units, roads):
 * the cards' tick boxes join through `data-pick`. A floor goes with the units on it; the API
 * removes all or none and names what it refused.
 */
export function RemoveSelected({ group }: { group: string }) {
  const t = useTranslations("Property.remove");
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    const update = () => setCount(boxes(group).filter((box) => box.checked).length);
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [group]);

  function selectAll() {
    const all = boxes(group);
    const on = !all.every((box) => box.checked);
    for (const box of all) box.checked = on;
    setCount(on ? all.length : 0);
  }

  async function remove() {
    const ids = boxes(group)
      .filter((box) => box.checked)
      .map((box) => box.value);
    if (!ids.length || !window.confirm(localDigits(t("confirm", { count: ids.length }), locale))) return;
    setBusy(true);
    setStatus(null);
    try {
      const { data, error } = await api.POST("/locations/remove-many", { body: { ids } });
      if (data) {
        setStatus({ ok: true, text: localDigits(t("done", { count: data.removed }), locale) });
        setCount(0);
        router.refresh();
        return;
      }
      const names = (error as { details?: { names?: string[] } } | undefined)?.details?.names ?? [];
      const text = tRoot(errorMessageKey(error));
      setStatus({ ok: false, text: names.length ? `${text} ${t("names", { names: names.join(", ") })}` : text });
    } catch {
      setStatus({ ok: false, text: tRoot("Admin.errors.network") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={selectAll}>
          {t("selectAll")}
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={busy || count === 0} onClick={() => void remove()}>
          <Trash2 aria-hidden />
          {t("removeSelected")}
          {count ? ` (${localDigits(count, locale)})` : ""}
        </Button>
      </div>
      <FormStatus status={status} />
    </div>
  );
}
