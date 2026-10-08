"use client";

import { NOTICE_CATEGORIES, type NoticeCategory } from "@s57/shared";
import { useTranslations } from "next-intl";
import { inputClass } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Mockup's "All categories" select. Changing it navigates straight away; the
 * Show button keeps it working as a plain GET form before JavaScript loads.
 */
export function CategoryFilter({ value }: { value?: NoticeCategory | undefined }) {
  const t = useTranslations("Notices");
  const router = useRouter();
  const pathname = usePathname();

  return (
    <form method="get" className="flex items-center gap-2">
      <label htmlFor="notice-category" className="sr-only">
        {t("filter")}
      </label>
      <select
        id="notice-category"
        name="category"
        defaultValue={value ?? ""}
        className={`${inputClass} w-auto`}
        onChange={(event) => {
          const category = event.currentTarget.value;
          router.replace(category ? { pathname, query: { category } } : pathname);
        }}
      >
        <option value="">{t("allCategories")}</option>
        {NOTICE_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {t(`category.${category}`)}
          </option>
        ))}
      </select>
      <noscript>
        <Button type="submit" variant="outline">
          {t("apply")}
        </Button>
      </noscript>
    </form>
  );
}
