"use client";

import { Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormStatus } from "@/components/admin/form-status";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { useSubmit } from "./use-submit";

/** "Separate": takes a part back out of the unit it was joined into, after a confirm. */
export function SeparateButton({ id, name, from }: { id: string; name: string; from: string }) {
  const t = useTranslations("Property.grid");
  const { status, busy, run } = useSubmit();

  async function separate() {
    if (!window.confirm(t("separateConfirm", { name, from }))) return;
    await run(() => api.POST("/units/{id}/separate", { params: { path: { id } } }), t("separated", { name }));
  }

  return (
    <div className="grid justify-items-start gap-1">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void separate()}>
        <Unlink aria-hidden />
        {t("separate")}
      </Button>
      <FormStatus status={status} />
    </div>
  );
}
