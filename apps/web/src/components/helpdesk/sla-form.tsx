"use client";

import { asciiDigits, SLA_HOURS_MAX, TICKET_CATEGORIES, type SlaView, type TicketCategory } from "@s57/shared";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { TextField } from "@/components/cms/fields";
import { Card } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const valid = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= SLA_HOURS_MAX;

/** Hours from opening to the due time, per category. Tickets already open keep their due time. */
export function SlaForm({ sla }: { sla: SlaView }) {
  const t = useTranslations("Helpdesk");
  const { status, busy, run } = useSubmit();
  const [hours, setHours] = useState<Record<TicketCategory, string>>(
    () => Object.fromEntries(TICKET_CATEGORIES.map((key) => [key, String(sla.hours[key])])) as Record<TicketCategory, string>,
  );
  const ready = TICKET_CATEGORIES.every((key) => valid(asciiDigits(hours[key])));

  return (
    <Card className="grid max-w-[640px] gap-3.5">
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          const body = Object.fromEntries(TICKET_CATEGORIES.map((key) => [key, Number(asciiDigits(hours[key]))])) as Record<TicketCategory, number>;
          void run(() => api.PUT("/helpdesk/sla", { body }));
        }}
      >
        <div className="grid gap-3.5 min-[600px]:grid-cols-3">
          {TICKET_CATEGORIES.map((key) => (
            <TextField
              key={key}
              id={`sla-${key}`}
              label={t(`category.${key}`)}
              inputMode="numeric"
              value={hours[key]}
              disabled={!sla.can.edit}
              onChange={(e) => setHours({ ...hours, [key]: e.target.value })}
            />
          ))}
        </div>
        {sla.can.edit ? (
          <Button type="submit" disabled={busy || !ready} className="justify-self-start">
            <Save aria-hidden />
            {t("save")}
          </Button>
        ) : null}
      </form>
      <FormStatus status={status} />
    </Card>
  );
}
