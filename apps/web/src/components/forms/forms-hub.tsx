"use client";

import { FORM_KEYS, UPCOMING_FORMS, type FormKey, type FormReceipt } from "@s57/shared";
import { BookUser, CalendarDays, Car, ChevronRight, CircleCheck, FileBadge, MessagesSquare, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { Card, Chip, IconBox, Kantha } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { MembershipApplication } from "./membership-form";
import { RenterRegistration } from "./renter-form";

const ICONS: Record<FormKey | (typeof UPCOMING_FORMS)[number], LucideIcon> = {
  membership: Users,
  renter_registration: BookUser,
  vehicle_sticker: Car,
  facility_booking: CalendarDays,
  noc: FileBadge,
  complaint: MessagesSquare,
};

/**
 * The mockup's `forms` view: the list of services on the left (the two online forms open on the
 * right, the others are "coming soon"), the chosen form on the right, then the receipt.
 */
/** `renterNidRequired`: the society requires an NID of renters (the membership form always asks). */
export function FormsHub({ office, renterNidRequired }: { office: ReactNode; renterNidRequired: boolean }) {
  const t = useTranslations("Forms");
  const [active, setActive] = useState<FormKey>("membership");
  const [receipt, setReceipt] = useState<FormReceipt | null>(null);
  // Remounting a form clears it after a submission ("make another application").
  const [round, setRound] = useState(0);
  const formTop = useRef<HTMLDivElement>(null);

  const open = (key: FormKey) => {
    setActive(key);
    setReceipt(null);
    // On phones the form sits below the list: bring it into view.
    formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid gap-3.5 min-[861px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-2.5">
        {FORM_KEYS.map((key) => {
          const selected = key === active;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() => open(key)}
              className={`flex items-center justify-between gap-2.5 rounded-[12px] border bg-surface p-4 text-left ${
                selected ? "border-primary shadow-[0_0_0_1px_var(--accent)]" : "border-line hover:border-muted-foreground"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <IconBox icon={ICONS[key]} />
                <span className="grid">
                  <span className="text-[15px] font-semibold">{t(`kinds.${key}`)}</span>
                  <span className="text-[13px] text-muted-foreground">{t(`kindHints.${key}`)}</span>
                </span>
              </span>
              <ChevronRight className="size-[18px] flex-none text-muted-foreground" aria-hidden />
            </button>
          );
        })}
        {UPCOMING_FORMS.map((key) => (
          <Card key={key} className="flex items-center justify-between gap-2.5 opacity-75" aria-disabled>
            <span className="flex items-center gap-2.5">
              <IconBox icon={ICONS[key]} tone="info" />
              <span className="grid">
                <span className="text-[15px] font-semibold">{t(`kinds.${key}`)}</span>
                <span className="text-[13px] text-muted-foreground">{t(`kindHints.${key}`)}</span>
              </span>
            </span>
            <Chip tone="neutral" plain>
              {t("comingSoon")}
            </Chip>
          </Card>
        ))}
        <p className="text-[12.5px] text-muted-foreground">{t("comingSoonHint")}</p>
        {office}
      </div>

      <div ref={formTop} className="scroll-mt-4">
        <Card className="grid content-start gap-3.5 min-[600px]:p-6">
          <div className="grid gap-1">
            <h2>{t(`kinds.${active}`)}</h2>
            <p className="text-[13px] text-muted-foreground">{t(`intro.${active}`)}</p>
          </div>
          <Kantha green />
          {receipt ? (
            <div role="status" className="grid gap-3">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-good">
                <CircleCheck className="size-5" aria-hidden />
                {t("doneTitle")}
              </p>
              {/* The reference stays in Latin letters and digits: it is a code the office types in. */}
              <p>{t.rich("doneBody", { reference: receipt.reference, ref: (chunks) => <strong className="num tracking-wider">{chunks}</strong> })}</p>
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                onClick={() => {
                  setReceipt(null);
                  setRound((n) => n + 1);
                }}
              >
                {t("another")}
              </Button>
            </div>
          ) : active === "membership" ? (
            <MembershipApplication key={`m-${round}`} onDone={setReceipt} />
          ) : (
            <RenterRegistration key={`r-${round}`} onDone={setReceipt} nidRequired={renterNidRequired} />
          )}
        </Card>
      </div>
    </div>
  );
}
