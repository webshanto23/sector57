"use client";

import { pick, type Locale, type WorkOrderDetail, type WorkOrderOptions } from "@s57/shared";
import { Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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

type StaffRef = { id: string; name: string; nameEn: string | null; staffNo: number };
/** Who does the job: nobody yet, a staff member, or a vendor. */
type Assignee = { kind: "none" } | { kind: "staff"; staff: StaffRef | null; staffId: string | null } | { kind: "vendor"; vendorId: string };

const assigneeOf = (order?: WorkOrderDetail): Assignee =>
  order?.staff ? { kind: "staff", staff: order.staff, staffId: order.staff.id } : order?.vendor ? { kind: "vendor", vendorId: order.vendor.id } : { kind: "none" };
const assigneeBody = (assignee: Assignee) => ({
  staffId: assignee.kind === "staff" ? assignee.staffId : null,
  vendorId: assignee.kind === "vendor" ? assignee.vendorId || null : null,
});

function AssigneeFields({ id, value, onChange, options }: { id: string; value: Assignee; onChange: (value: Assignee) => void; options: WorkOrderOptions }) {
  const t = useTranslations("WorkOrders");
  const kinds = ["none", "staff", "vendor"] as const;
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={t("assignee")} className="flex flex-wrap gap-4 text-[13.5px]">
        {kinds.map((kind) => (
          <label key={kind} className="flex items-center gap-2">
            <input
              type="radio"
              name={`${id}-kind`}
              checked={value.kind === kind}
              onChange={() => onChange(kind === "staff" ? { kind, staff: null, staffId: null } : kind === "vendor" ? { kind, vendorId: options.vendors[0]?.id ?? "" } : { kind })}
              className="accent-primary"
            />
            {t(`assigneeKind.${kind}`)}
          </label>
        ))}
      </div>
      {value.kind === "staff" ? (
        <CustodianPicker id={`${id}-staff`} initial={value.staff} source="work-orders" onChange={(staffId) => onChange({ ...value, staffId })} />
      ) : null}
      {value.kind === "vendor" ? (
        <Field label={t("vendor")} htmlFor={`${id}-vendor`}>
          <select id={`${id}-vendor`} className={inputClass} value={value.vendorId} onChange={(e) => onChange({ kind: "vendor", vendorId: e.target.value })}>
            <option value="">{t("chooseVendor")}</option>
            {options.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );
}

type Details = { title: string; description: string; estimatedCost: string };

function DetailFields({ id, values, onChange }: { id: string; values: Details; onChange: (values: Details) => void }) {
  const t = useTranslations("WorkOrders");
  return (
    <div className="grid gap-3.5">
      <TextField id={`${id}-title`} label={t("title")} value={values.title} maxLength={150} onChange={(e) => onChange({ ...values, title: e.target.value })} />
      <TextAreaField id={`${id}-description`} label={t("description")} rows={3} maxLength={2000} value={values.description} onChange={(e) => onChange({ ...values, description: e.target.value })} />
      <TextField
        id={`${id}-cost`}
        label={t("estimatedCost")}
        hint={t("optional")}
        inputMode="decimal"
        value={values.estimatedCost}
        onChange={(e) => onChange({ ...values, estimatedCost: e.target.value })}
      />
    </div>
  );
}

const detailsBody = (values: Details) => ({ title: values.title, description: values.description || null, estimatedCost: values.estimatedCost.trim() || null });

/** Where the new job comes from, decided by the page: a ticket, an asset (maybe one of its upkeep plans), or a place picked here. */
export type WorkOrderSource =
  | { kind: "ticket"; id: string; label: string; title: string }
  | { kind: "asset"; id: string; label: string; plans: { id: string; task: { bn: string; en: string | null } }[]; planId: string | null }
  | { kind: "none" };

/** A new work order. Opens its page once saved. */
export function NewWorkOrderForm({ source, options }: { source: WorkOrderSource; options: WorkOrderOptions }) {
  const t = useTranslations("WorkOrders");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { status, busy, run } = useSubmit();
  const [place, setPlace] = useState<PickedPlace>(null);
  const [planId, setPlanId] = useState(source.kind === "asset" ? source.planId : null);
  const firstTitle = source.kind === "ticket" ? source.title : source.kind === "asset" ? (source.plans.find((plan) => plan.id === planId)?.task.bn ?? "") : "";
  const [values, setValues] = useState<Details>({ title: firstTitle, description: "", estimatedCost: "" });
  const [assignee, setAssignee] = useState<Assignee>({ kind: "none" });
  const ready = values.title.trim() !== "" && (source.kind !== "none" || place !== null);

  async function save() {
    const body = {
      ticketId: source.kind === "ticket" ? source.id : null,
      assetId: source.kind === "asset" ? source.id : null,
      planId,
      locationId: source.kind === "none" ? (place?.id ?? null) : null,
      ...detailsBody(values),
      ...assigneeBody(assignee),
    };
    const made = await run(() => api.POST("/work-orders", { body }));
    if (made) router.push(`/dashboard/work/${made.id}`);
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
        <h2 className="text-[15px]">{t("source")}</h2>
        {source.kind === "none" ? <PlacePicker id="work-place" onChange={setPlace} topWhenEmpty /> : <p className="text-[13.5px]">{source.label}</p>}
        {source.kind === "asset" && source.plans.length > 0 ? (
          <Field label={t("plan")} htmlFor="work-plan">
            <select id="work-plan" className={inputClass} value={planId ?? ""} onChange={(e) => setPlanId(e.target.value || null)}>
              <option value="">{t("noPlan")}</option>
              {source.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {pick(plan.task.bn, plan.task.en, locale)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("details")}</h2>
        <DetailFields id="work" values={values} onChange={setValues} />
      </Card>
      <Card className="grid gap-3.5">
        <h2 className="text-[15px]">{t("assignee")}</h2>
        <AssigneeFields id="work-assignee" value={assignee} onChange={setAssignee} options={options} />
      </Card>
      <FormStatus status={status} />
      <Button type="submit" disabled={busy || !ready} className="justify-self-start">
        {t("create")}
      </Button>
    </form>
  );
}

/** Change the job's details, estimate and who does it (while open or in progress). */
export function WorkOrderEditor({ order, options }: { order: WorkOrderDetail; options: WorkOrderOptions }) {
  const t = useTranslations("WorkOrders");
  const { status, busy, run } = useSubmit();
  const [values, setValues] = useState<Details>({ title: order.title, description: order.description ?? "", estimatedCost: order.estimatedCost ?? "" });
  const [assignee, setAssignee] = useState<Assignee>(() => assigneeOf(order));

  return (
    <Card className="grid gap-3.5">
      <h2 className="text-[15px]">{t("details")}</h2>
      <form
        noValidate
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api.PATCH("/work-orders/{id}", { params: { path: { id: order.id } }, body: { ...detailsBody(values), ...assigneeBody(assignee) } }));
        }}
      >
        <DetailFields id="work-edit" values={values} onChange={setValues} />
        <h3 className="text-[14px]">{t("assignee")}</h3>
        <AssigneeFields id="work-edit-assignee" value={assignee} onChange={setAssignee} options={options} />
        <Button type="submit" disabled={busy || !values.title.trim()} className="justify-self-start">
          <Save aria-hidden />
          {t("save")}
        </Button>
      </form>
      <FormStatus status={status} />
    </Card>
  );
}
