"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { errorMessageKey } from "@/components/admin/errors";
import type { Status } from "@/components/admin/form-status";
import { useRouter } from "@/i18n/navigation";
import { refreshPublicSite } from "@/lib/actions/public-site";

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * Sends a change to the API and reports the outcome. On success the cached public
 * pages are dropped (so the website shows the change at once) and the dashboard
 * page's server data reloads.
 */
export function useSave() {
  const t = useTranslations();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function afterChange(message?: string) {
    await refreshPublicSite().catch(() => undefined);
    setStatus({ ok: true, text: message ?? t("Admin.saved") });
    router.refresh();
  }

  /** Runs one API call; returns its data on success, undefined otherwise. */
  async function run<T>(call: () => Promise<ApiResult<T>>, okMessage?: string): Promise<T | undefined> {
    setStatus(null);
    setBusy(true);
    try {
      const { data, error, response } = await call();
      if (!response.ok) {
        setStatus({ ok: false, text: t(errorMessageKey(error)) });
        return undefined;
      }
      await afterChange(okMessage);
      return (data ?? null) as T;
    } catch {
      setStatus({ ok: false, text: t("Admin.errors.network") });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { status, setStatus, busy, run, afterChange };
}
