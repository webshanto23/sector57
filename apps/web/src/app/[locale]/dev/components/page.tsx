import { formatNumber, formatTaka, localDigits, type Locale } from "@s57/shared";
import {
  Banknote,
  Building2,
  Download,
  Megaphone,
  Plus,
  Receipt,
  ShieldCheck,
  Siren,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Avatar,
  Card,
  Chip,
  DataTable,
  Field,
  Grid,
  IconTitle,
  inputClass,
  Kantha,
  PageHeader,
  ProgressBar,
  SearchInput,
  Stack,
  StatCard,
  type Column,
  type Tone,
} from "@/components/kit";
import { LocaleSwitch } from "@/components/locale-switch";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

// Developer-only gallery of the mockup components (design guide §7). Not served in production.
export const metadata = { robots: { index: false } };

type Invoice = { no: string; unit: string; billTo: string; amount: string; status: [string, Tone] };

export default async function ComponentsPage({ params }: PageProps<"/[locale]/dev/components">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const L = (bn: string, en: string) => (locale === "bn" ? bn : en);
  const tk = (amount: string) => formatTaka(amount, locale);

  const invoices: Invoice[] = [
    { no: "INV-2611-0412", unit: L("ফ্ল্যাট ৪বি, রোড ৯", "Flat 4B, Road 9"), billTo: L("রাশেদ হোসেন (ভাড়াটিয়া)", "Rashed Hossain (renter)"), amount: "1500.00", status: [L("পরিশোধিত", "Paid"), "good"] },
    { no: "INV-2611-0413", unit: L("ফ্ল্যাট ৬এ, রোড ৯", "Flat 6A, Road 9"), billTo: L("রোকেয়া বেগম (মালিক)", "Rokeya Begum (owner)"), amount: "1500.00", status: [L("অপরিশোধিত", "Unpaid"), "warn"] },
    { no: "INV-2610-1188", unit: L("ফ্লোর ২, রোড ২২", "Floor 2, Road 22"), billTo: L("নূর ট্রেডার্স লিমিটেড", "Nur Traders Ltd"), amount: "18000.00", status: [L("মেয়াদোত্তীর্ণ", "Overdue"), "bad"] },
  ];
  const columns: Column<Invoice>[] = [
    { key: "no", header: L("ইনভয়েস", "Invoice"), cell: (r) => <span className="font-mono text-[12.5px]">{r.no}</span> },
    { key: "unit", header: L("ইউনিট", "Unit"), cell: (r) => r.unit },
    { key: "billTo", header: L("যার নামে বিল", "Bill to"), cell: (r) => r.billTo },
    { key: "amount", header: L("পরিমাণ", "Amount"), numeric: true, cell: (r) => tk(r.amount) },
    { key: "status", header: L("অবস্থা", "Status"), cell: (r) => <Chip tone={r.status[1]}>{r.status[0]}</Chip> },
  ];

  return (
    <main className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-[22px]">
      <PageHeader
        title={L("কম্পোনেন্ট", "Components")}
        sub={L("মকআপের ৭ নম্বর অংশের সাথে মিলিয়ে দেখুন", "Compare with section 7 of the mockup")}
        actions={
          <>
            <LocaleSwitch />
            <ThemeToggle />
          </>
        }
      />

      <section className="grid gap-3">
        <h2>{L("বোতাম", "Buttons")}</h2>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button>
            <Plus />
            {L("নতুন নোটিশ", "New notice")}
          </Button>
          <Button variant="outline">
            <Download />
            {L("এক্সপোর্ট", "Export")}
          </Button>
          <Button variant="ghost">{L("বাতিল", "Cancel")}</Button>
          <Button variant="destructive">{L("মুছে ফেলুন", "Delete")}</Button>
          <Button variant="outline" size="pill">
            {L("ছোট বোতাম", "Pill")}
          </Button>
          <Button disabled>{L("নিষ্ক্রিয়", "Disabled")}</Button>
        </div>
      </section>

      <section className="grid gap-3">
        <h2>{L("অবস্থা", "Status chips")}</h2>
        <div className="flex flex-wrap gap-2">
          <Chip tone="good">{L("পরিশোধিত", "Paid")}</Chip>
          <Chip tone="warn">{L("অপরিশোধিত", "Unpaid")}</Chip>
          <Chip tone="bad">{L("মেয়াদোত্তীর্ণ", "Overdue")}</Chip>
          <Chip tone="info">{L("নতুন", "New")}</Chip>
          <Chip tone="acc">{L("সাধারণ সভা", "AGM")}</Chip>
          <Chip>{L("খসড়া", "Draft")}</Chip>
          <Chip tone="good" plain>
            {L("বিন্দু ছাড়া", "No dot")}
          </Chip>
        </div>
      </section>

      <section className="grid gap-3">
        <h2>{L("পরিসংখ্যান কার্ড", "Stat cards")}</h2>
        <Grid cols={4}>
          <StatCard icon={Banknote} label={L("অক্টোবরে আদায়", "Collected in October")} value={tk("2170000")} note={L("বিলের ৮৭%", "87% of billed")} />
          <StatCard icon={TriangleAlert} tone="sun" label={L("বকেয়া", "Arrears")} value={tk("684500")} note={L("৩১২টি ইউনিট মেয়াদোত্তীর্ণ", "312 units overdue")} />
          <StatCard icon={Building2} tone="info" label={L("বসবাসরত ইউনিট", "Occupied units")} value={formatNumber(3014, locale)} />
          <StatCard icon={ShieldCheck} tone="warn" label={L("যাচাই বাকি", "Pending verification")} value={formatNumber(57, locale)} />
        </Grid>
      </section>

      <section className="grid gap-3">
        <h2>{L("কার্ড ও গ্রিড", "Cards and grids")}</h2>
        <Grid cols={3}>
          <Card>
            <Stack>
              <IconTitle icon={Megaphone}>{L("নোটিশ বোর্ড", "Notice board")}</IconTitle>
              <p className="text-muted-foreground">{L("সাধারণ কার্ড", "Plain card")}</p>
            </Stack>
          </Card>
          <Card flat>
            <Stack>
              <IconTitle icon={Siren} tone="sun">
                {L("জরুরি যোগাযোগ", "Emergency contacts")}
              </IconTitle>
              <p className="num text-muted-foreground">{localDigits("01711-000057", locale)}</p>
            </Stack>
          </Card>
          <Card>
            <Stack>
              <IconTitle icon={Receipt} tone="warn">
                {L("উন্নয়ন কাজ", "Development work")}
              </IconTitle>
              <div className="grid gap-1.5">
                <div className="flex justify-between">
                  <h4>{L("রোড ৭ ড্রেন সংস্কার", "Road 7 drain repair")}</h4>
                  <span className="num text-[12.5px] text-muted-foreground">{localDigits("65%", locale)}</span>
                </div>
                <ProgressBar value={65} label={L("অগ্রগতি", "Progress")} />
              </div>
              <ProgressBar value={100} tone="good" label={L("সম্পন্ন", "Complete")} />
            </Stack>
          </Card>
        </Grid>
      </section>

      <section className="grid gap-3">
        <h2>{L("টেবিল (ফোনে কার্ড)", "Table (cards on phones)")}</h2>
        <div className="flex flex-wrap gap-2">
          <SearchInput placeholder={L("ইনভয়েস বা ইউনিট খুঁজুন", "Search invoice or unit")} aria-label={L("খুঁজুন", "Search")} />
          <select className={`${inputClass} w-auto`} aria-label={L("অবস্থা", "Status")}>
            <option>{L("সব অবস্থা", "All status")}</option>
          </select>
        </div>
        <DataTable caption={L("ইনভয়েস", "Invoices")} columns={columns} rows={invoices} rowKey={(r) => r.no} />
      </section>

      <section className="grid gap-3">
        <h2>{L("ফর্ম, অবতার ও নকশা", "Form, avatars and motifs")}</h2>
        <Grid cols={2}>
          <Card>
            <Stack>
              <h2>{L("সদস্যপদের আবেদন", "Membership application")}</h2>
              <Kantha green />
              <Field label={L("পূর্ণ নাম", "Full name")} htmlFor="dev-name">
                <input id="dev-name" className={inputClass} defaultValue={L("আয়েশা সিদ্দিকা", "Ayesha Siddiqua")} />
              </Field>
              <Field label={L("মোবাইল নম্বর", "Mobile number")} htmlFor="dev-phone">
                <input id="dev-phone" className={`${inputClass} num`} defaultValue={localDigits("01712-345678", locale)} />
              </Field>
            </Stack>
          </Card>
          <Card>
            <Stack>
              <div className="flex flex-wrap items-center gap-4">
                <Avatar name={L("মোঃ জাহাঙ্গীর আলম", "Md. Jahangir Alam")} />
                <Avatar name={L("রোকেয়া বেগম", "Rokeya Begum")} />
                <Avatar name={L("রফিকুল ইসলাম", "Rafiqul Islam")} size="lg" />
              </div>
              <Kantha />
              <p className="font-display text-[26px] leading-[1.35]">{L("নিরাপদ, পরিচ্ছন্ন ও সুশৃঙ্খল সেক্টর ৫৭", "A safe, clean, orderly Sector 57")}</p>
              <div className="flex items-center gap-2.5">
                <UserRound className="size-[18px] text-muted-foreground" aria-hidden />
                <span className="font-mono text-[12.5px]">RC-08813</span>
              </div>
            </Stack>
          </Card>
        </Grid>
      </section>
    </main>
  );
}
