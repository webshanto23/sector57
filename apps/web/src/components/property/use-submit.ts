"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import type { Status } from "@/components/admin/form-status";
import { useRouter } from "@/i18n/navigation";

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Sends one change to the API, reports the outcome and reloads the page's server data
 * on success. Unlike the CMS `useSave`, it leaves the public website's cache alone.
 */
export function useSubmit() {
  const t = useTranslations();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  /** Returns the response data on success (null for 204), undefined on failure. */
  async function run<T>(call: () => Promise<ApiResult<T>>, okMessage?: string): Promise<T | null | undefined> {
    setStatus(null);
    setBusy(true);
    try {
      const { data, error, response } = await call();
      if (!response.ok) {
        setStatus({ ok: false, text: t(errorMessageKey(error)) });
        return undefined;
      }
      setStatus({ ok: true, text: okMessage ?? t("Admin.saved") });
      router.refresh();
      return data ?? null;
    } catch {
      setStatus({ ok: false, text: t("Admin.errors.network") });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { status, setStatus, busy, run };
}
