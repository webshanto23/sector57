"use client";

import { TICKET_CATEGORIES, TICKET_PRIORITIES, type TicketCategory, type TicketDetail, type TicketPriority } from "@s57/shared";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { TextAreaField, TextField } from "@/components/cms/fields";
import { CustodianPicker } from "@/components/facilities/asset-fields";
import { PlacePicker, type PickedPlace } from "@/components/forms/place-picker";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

type Details = { category: TicketCategory; priority: TicketPriority; title: string; description: string };
type Reporter = { kind: "none" } | { kind: "typed"; name: string; phone: string };

const detailsOf = (ticket?: TicketDetail): Details => ({
  category: ticket?.category ?? "other",
  priority: ticket?.priority ?? "normal",
  title: ticket?.title ?? "",
  description: ticket?.description ?? "",
});
const reporterOf = (ticket?: TicketDetail): Reporter =>
  ticket?.reporter.kind === "typed" ? { kind: "typed", name: ticket.reporter.name, phone: ticket.reporter.phone ?? "" } : { kind: "none" };
const reporterBody = (reporter: Reporter) => (reporter.kind === "typed" ? { kind: "typed" as const, name: reporter.name, phone: reporter.phone || null } : reporter);

function DetailFields({ id, values, onChange }: { id: string; values: Details; onChange: (values: Details) => void }) {
  const t = useTranslations("Helpdesk");
  return (
    <div className="grid gap-3.5">
      <div className="grid gap-3.5 min-[600px]:grid-cols-2">
        <Field label={t("categoryLabel")} htmlFor={`${id}-category`}>
          <select id={`${id}-category`} className={inputClass} value={values.category} onChange={(e) => onChange({ ...values, category: e.target.value as TicketCategory })}>
            {TICKET_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {t(`category.${key}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("priorityLabel")} htmlFor={`${id}-priority`}>
          <select id={`${id}-priority`} className={inputClass} value={values.priority} onChange={(e) => onChange({ ...values, priority: e.target.value as TicketPriority })}>
            {TICKET_PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {t(`priority.${key}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <TextField id={`${id}-title`} label={t("title")} value={values.title} maxLength={150} onChange={(e) => onChange({ ...values, title: e.target.value })} />
      <TextAreaField id={`${id}-description`} label={t("description")} value={values.description} maxLength={2000} rows={3} onChange={(e) => onChange({ ...values, description: e.target.value })} />
    </div>
  );
}

/** Who reported it: nobody in particular, or a name and phone typed in from a call or a visit. */
function ReporterFields({ id, value, onChange }: { id: string; value: Reporter; onChange: (value: Reporter) => void }) {
  const t = useTranslations("Helpdesk");
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={t("reporter")} className="flex flex-wrap gap-4 text-[13.5px]">
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-kind`} checked={value.kind === "none"} onChange={() => onChange({ kind: "none" })} className="accent-primary" />
          {t("reporterNone")}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={`${id}-kind`} checked={value.kind === "typed"} onChange={() => onChange({ kind: "typed", name: "", phone: "" })} className="accent-primary" />
          {t("reporterTyped")}
        </label>
      </div>
      {value.kind === "typed" ? (
        <div className="grid gap-3.5 min-[600px]:grid-cols-2">
          <TextField id={`${id}-name`} label={t("reporterName")} value={value.name} maxLength={100} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <TextField id={`${id}-phone`} label={t("reporterPhone")} hint={t("optional")} inputMode="tel" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
        </div>
      ) : null}
    </div>
  );
}

const reporterReady = (reporter: Reporter) => reporter.kind === "none" || reporter.name.trim() !== "";

/** A phone-in or walk-in complaint: where, what, who reported it, and optionally who takes it. Opens the ticket once saved. */
export function NewTicketForm() {
  const t = useTranslations("Helpdesk");
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [place, setPlace] = useState<PickedPlace>(null);
  const [values, setValues] = useState<Details>(() => detailsOf());
  const [reporter, setReporter] = useState<Reporter>({ kind: "none" });
  const [staffId, setStaffId] = useState<string | null>(null);
  const ready = place !== null && values.title.trim() !== "" && reporterReady(reporter);

  async function save() {
    if (!place) return;
    const body = { ...values, description: values.description || null, locationId: place.id, reporter: reporterBody(reporter), assignedStaffId: staffId };
    const made = await run(() => api.POST("/tickets", { body }));
    if (made) router.push(`/dashboard/helpdesk/${made.id}`);
  }

  return (
    <form
      noValidate
      className="grid gap-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("where")}</h2>
        <PlacePicker id="ticket-place" onChange={setPlace} topWhenEmpty />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("what")}</h2>
        <DetailFields id="ticket" values={values} onChange={setValues} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("reporter")}</h2>
        <ReporterFields id="ticket-reporter" value={reporter} onChange={setReporter} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("assignee")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("assigneeHint")}</p>
        <CustodianPicker id="ticket-staff" initial={null} onChange={setStaffId} source="tickets" />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || !ready} className="justify-self-start">
        {t("create")}
      </Button>
    </form>
  );
}

/** Change what, how urgent and who reported it (while not closed or cancelled). A new category moves the due time. */
export function TicketEditor({ ticket }: { ticket: TicketDetail }) {
  const t = useTranslations("Helpdesk");
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState<Details>(() => detailsOf(ticket));
  const [reporter, setReporter] = useState<Reporter>(() => reporterOf(ticket));
  // A reporter on record can't be picked here; leave it alone unless the office changes the choice.
  const [reporterTouched, setReporterTouched] = useState(false);

  return (
    <Card className="grid gap-3.5">
      <h2 className="text-[15px]">{t("details")}</h2>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          const body = { ...values, description: values.description || null, ...(reporterTouched ? { reporter: reporterBody(reporter) } : {}) };
          void run(() => api.PATCH("/tickets/{id}", { params: { path: { id: ticket.id } }, body }));
        }}
      >
        <DetailFields id="ticket-edit" values={values} onChange={setValues} />
        {ticket.reporter.kind === "person" && !reporterTouched ? (
          <p className="text-[13px] text-muted-foreground">{t("reporterPerson", { name: ticket.reporter.name })}</p>
        ) : null}
        <ReporterFields
          id="ticket-edit-reporter"
          value={reporter}
          onChange={(value) => {
            setReporter(value);
            setReporterTouched(true);
          }}
        />
        <Button type="submit" disabled={busy || !values.title.trim() || !reporterReady(reporter)} className="justify-self-start">
          <Save aria-hidden />
          {t("save")}
        </Button>
      </form>
      <FormStatus status={status} />
    </Card>
  );
}

/** Give the ticket to a staff member, or take it back. */
export function AssignCard({ ticket }: { ticket: TicketDetail }) {
  const t = useTranslations("Helpdesk");
  const { status, run } = useSubmit();
  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("assignee")}</h2>
      <CustodianPicker
        id="ticket-assign"
        initial={ticket.assignee}
        source="tickets"
        onChange={(staffId) => void run(() => api.POST("/tickets/{id}/assign", { params: { path: { id: ticket.id } }, body: { staffId, note: null } }))}
      />
      <FormStatus status={status} />
    </Card>
  );
}

/** The status changes the user may make; resolving says what was done, cancelling says why. */
export function TicketStatusCard({ ticket }: { ticket: TicketDetail }) {
  const t = useTranslations("Helpdesk");
  const { status, busy, run } = useSubmit();
  const [to, setTo] = useState(ticket.can.statuses[0]!);
  const [note, setNote] = useState("");
  const needsNote = to === "resolved" || to === "cancelled";

  return (
    <Card className="grid gap-3">
      <h2 className="text-[15px]">{t("statusTitle")}</h2>
      <Field label={t("statusTo")} htmlFor="ticket-status">
        <select id="ticket-status" className={inputClass} value={to} onChange={(e) => setTo(e.target.value as typeof to)}>
          {ticket.can.statuses.map((value) => (
            <option key={value} value={value}>
              {t(`move.${value}`)}
            </option>
          ))}
        </select>
      </Field>
      <TextAreaField
        id="ticket-status-note"
        label={to === "resolved" ? t("resolutionNote") : to === "cancelled" ? t("cancelReason") : t("statusNote")}
        rows={2}
        maxLength={1000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        type="button"
        variant={to === "cancelled" ? "destructive" : "outline"}
        className="justify-self-start"
        disabled={busy || (needsNote && !note.trim())}
        onClick={() =>
          void run(() => api.POST("/tickets/{id}/status", { params: { path: { id: ticket.id } }, body: { status: to, note: note || null } })).then((done) => {
            if (done) setNote("");
          })
        }
      >
        {t("statusSave")}
      </Button>
      <FormStatus status={status} />
    </Card>
  );
}
