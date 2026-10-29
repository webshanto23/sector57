"use client";

import { FORM_KEYS, type FormEntry, type FormKey, type FormReceipt } from "@s57/shared";
import { BookUser, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MembershipApplication } from "@/components/forms/membership-form";
import { RenterRegistration } from "@/components/forms/renter-form";
import { enterForm } from "@/components/forms/submit";
import { Card, IconBox, Kantha } from "@/components/kit";
import { useRouter } from "@/i18n/navigation";

const ICONS: Record<FormKey, LucideIcon> = { membership: Users, renter_registration: BookUser };

/**
 * The office types in an application: a choice of the form, then the same fields as the public
 * website. Saved, it opens the new application's page for review.
 */
export function NewApplication({ renterNidRequired }: { renterNidRequired: boolean }) {
  const t = useTranslations("Forms");
  const tAdmin = useTranslations("FormsAdmin");
  const router = useRouter();
  const [active, setActive] = useState<FormKey>("membership");

  const done = (receipt: FormReceipt | FormEntry) => {
    if ("id" in receipt) router.push(`/dashboard/forms/${receipt.id}`);
  };

  return (
    <div className="grid gap-3.5">
      <fieldset className="grid gap-2.5 min-[600px]:grid-cols-2">
        <legend className="mb-1.5 text-[13px] font-semibold">{tAdmin("chooseForm")}</legend>
        {FORM_KEYS.map((key) => (
          <label
            key={key}
            className={`flex cursor-pointer items-center gap-2.5 rounded-[12px] border bg-surface p-4 ${
              key === active ? "border-primary shadow-[0_0_0_1px_var(--accent)]" : "border-line hover:border-muted-foreground"
            }`}
          >
            <input type="radio" name="formKey" value={key} checked={key === active} onChange={() => setActive(key)} className="size-4 accent-primary" />
            <IconBox icon={ICONS[key]} />
            <span className="grid">
              <span className="text-[15px] font-semibold">{t(`kinds.${key}`)}</span>
              <span className="text-[13px] text-muted-foreground">{t(`kindHints.${key}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Card className="grid content-start gap-3.5 min-[600px]:p-6">
        <div className="grid gap-1">
          <h2>{t(`kinds.${active}`)}</h2>
          <p className="text-[13px] text-muted-foreground">{t(`intro.${active}`)}</p>
        </div>
        <Kantha green />
        {active === "membership" ? (
          <MembershipApplication key="membership" onDone={done} send={enterForm} />
        ) : (
          <RenterRegistration key="renter" onDone={done} nidRequired={renterNidRequired} send={enterForm} />
        )}
      </Card>
    </div>
  );
}
