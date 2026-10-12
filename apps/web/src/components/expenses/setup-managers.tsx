"use client";

import { localDigits, pick, type ExpenseHead, type Locale, type Vendor } from "@s57/shared";
import { Archive, ArchiveRestore, Pencil, Plus, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormStatus } from "@/components/admin/form-status";
import { Card, Field, inputClass } from "@/components/kit";
import { useSubmit } from "@/components/property/use-submit";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/** Expense heads: add, rename, archive and restore. Archived heads take no new expenses. */
export function HeadsManager({ heads }: { heads: ExpenseHead[] }) {
  const t = useTranslations("Expenses.setup");
  const [adding, setAdding] = useState(false);
  return (
    <section className="grid content-start gap-2.5" aria-labelledby="heads-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="heads-title" className="text-[15px]">
          {t("heads")}
        </h2>
        {!adding ? (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("addHead")}
          </Button>
        ) : null}
      </div>
      {adding ? <HeadForm onDone={() => setAdding(false)} /> : null}
      {heads.length === 0 ? <Card className="text-muted-foreground">{t("noHeads")}</Card> : null}
      <ul className="grid gap-2">
        {heads.map((head) => (
          <li key={head.id}>
            <HeadRow head={head} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HeadRow({ head }: { head: ExpenseHead }) {
  const t = useTranslations("Expenses.setup");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState(false);
  const { status, busy, run } = useSubmit();
  if (editing) return <HeadForm head={head} onDone={() => setEditing(false)} />;
  const path = { params: { path: { id: head.id } } };
  return (
    <Card className={`grid gap-1.5 ${head.archived ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{pick(head.nameBn, head.nameEn, locale)}</p>
          <p className="text-[12.5px] text-muted-foreground">
            {localDigits(t("used", { count: head.used }), locale)}
            {head.archived ? ` · ${t("archivedMark")}` : ""}
          </p>
        </div>
        {!head.archived ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")} title={t("edit")} onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(
              () => (head.archived ? api.POST("/expense-heads/{id}/restore", path) : api.POST("/expense-heads/{id}/archive", path)),
              head.archived ? t("restored") : t("archived"),
            )
          }
        >
          {head.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {head.archived ? t("restore") : t("archive")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function HeadForm({ head, onDone }: { head?: ExpenseHead; onDone: () => void }) {
  const t = useTranslations("Expenses.setup");
  const { status, busy, run } = useSubmit();
  const [nameBn, setNameBn] = useState(head?.nameBn ?? "");
  const [nameEn, setNameEn] = useState(head?.nameEn ?? "");
  const prefix = head ? `head-${head.id}` : "head-new";
  async function save() {
    const body = { nameBn, nameEn: nameEn || null };
    const saved = await run(() => (head ? api.PUT("/expense-heads/{id}", { params: { path: { id: head.id } }, body }) : api.POST("/expense-heads", { body })));
    if (saved) onDone();
  }
  return (
    <Card className="grid gap-3">
      <div className="grid gap-3 min-[600px]:grid-cols-2">
        <Field label={t("nameBn")} htmlFor={`${prefix}-bn`}>
          <input id={`${prefix}-bn`} className={inputClass} value={nameBn} maxLength={100} onChange={(e) => setNameBn(e.target.value)} />
        </Field>
        <Field label={t("nameEn")} htmlFor={`${prefix}-en`}>
          <input id={`${prefix}-en`} className={inputClass} value={nameEn} maxLength={100} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || nameBn.trim() === ""} onClick={() => void save()}>
          <Save aria-hidden />
          {t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

/** Vendors: names as typed, phone and what they do. Archived vendors take no new expenses. */
export function VendorsManager({ vendors }: { vendors: Vendor[] }) {
  const t = useTranslations("Expenses.setup");
  const [adding, setAdding] = useState(false);
  return (
    <section className="grid content-start gap-2.5" aria-labelledby="vendors-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="vendors-title" className="text-[15px]">
          {t("vendors")}
        </h2>
        {!adding ? (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("addVendor")}
          </Button>
        ) : null}
      </div>
      {adding ? <VendorForm onDone={() => setAdding(false)} /> : null}
      {vendors.length === 0 ? <Card className="text-muted-foreground">{t("noVendors")}</Card> : null}
      <ul className="grid gap-2">
        {vendors.map((vendor) => (
          <li key={vendor.id}>
            <VendorRow vendor={vendor} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function VendorRow({ vendor }: { vendor: Vendor }) {
  const t = useTranslations("Expenses.setup");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState(false);
  const { status, busy, run } = useSubmit();
  if (editing) return <VendorForm vendor={vendor} onDone={() => setEditing(false)} />;
  const path = { params: { path: { id: vendor.id } } };
  return (
    <Card className={`grid gap-1.5 ${vendor.archived ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{vendor.name}</p>
          <p className="num text-[12.5px] text-muted-foreground">
            {[vendor.service, vendor.phone, localDigits(t("used", { count: vendor.used }), locale), vendor.archived ? t("archivedMark") : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {!vendor.archived ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")} title={t("edit")} onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(
              () => (vendor.archived ? api.POST("/vendors/{id}/restore", path) : api.POST("/vendors/{id}/archive", path)),
              vendor.archived ? t("restored") : t("archived"),
            )
          }
        >
          {vendor.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          {vendor.archived ? t("restore") : t("archive")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}

function VendorForm({ vendor, onDone }: { vendor?: Vendor; onDone: () => void }) {
  const t = useTranslations("Expenses.setup");
  const { status, busy, run } = useSubmit();
  const [name, setName] = useState(vendor?.name ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [service, setService] = useState(vendor?.service ?? "");
  const prefix = vendor ? `vendor-${vendor.id}` : "vendor-new";
  async function save() {
    const body = { name, phone: phone || null, service: service || null };
    const saved = await run(() => (vendor ? api.PUT("/vendors/{id}", { params: { path: { id: vendor.id } }, body }) : api.POST("/vendors", { body })));
    if (saved) onDone();
  }
  return (
    <Card className="grid gap-3">
      <div className="grid gap-3 min-[600px]:grid-cols-3">
        <Field label={t("vendorName")} htmlFor={`${prefix}-name`}>
          <input id={`${prefix}-name`} className={inputClass} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("phone")} htmlFor={`${prefix}-phone`}>
          <input id={`${prefix}-phone`} inputMode="tel" className={`${inputClass} num`} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label={t("service")} htmlFor={`${prefix}-service`}>
          <input id={`${prefix}-service`} className={inputClass} value={service} maxLength={100} onChange={(e) => setService(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || name.trim() === ""} onClick={() => void save()}>
          <Save aria-hidden />
          {t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
      <FormStatus status={status} />
    </Card>
  );
}
