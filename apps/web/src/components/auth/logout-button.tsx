"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

/** `compact` shows only the icon below 600 px (the dashboard header). */
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Account");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    // Leave even if the call fails: the API clears the cookies, and an expired session is already gone.
    await api.POST("/auth/logout").catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={logout} disabled={pending} title={compact ? t("logout") : undefined}>
      <LogOut aria-hidden />
      <span className={compact ? "max-[600px]:sr-only" : undefined}>{t("logout")}</span>
    </Button>
  );
}
