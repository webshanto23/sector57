import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { ThemeScript } from "@/components/theme/theme-script";
import { routing } from "@/i18n/routing";
import { getBrand } from "@/lib/brand";
import "../globals.css";

// next/font sets the font tokens that globals.css reads (--font-sans, --font-display, --font-geist-mono).
const sans = localFont({
  src: "../fonts/NotoSansBengali-VariableFont_wdth,wght.ttf",
  variable: "--font-sans",
  display: "swap",
});
const display = localFont({
  src: "../fonts/NotoSerifBengali-VariableFont_wdth,wght.ttf",
  variable: "--font-display",
  display: "swap",
});
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const [t, brand] = await Promise.all([getTranslations({ locale, namespace: "Common" }), getBrand(locale)]);
  return {
    // Absolute canonical and hreflang URLs in production (e.g. https://sector57society.org).
    ...(process.env.SITE_URL ? { metadataBase: new URL(process.env.SITE_URL) } : {}),
    title: { default: brand.name, template: `%s | ${brand.name}` },
    description: t("siteDescription", { name: brand.name }),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${sans.variable} ${display.variable} ${mono.variable} flex min-h-full flex-col font-sans`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
