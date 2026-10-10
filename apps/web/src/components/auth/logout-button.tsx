"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";

export function LogoutButton() {
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
    <Button variant="outline" onClick={logout} disabled={pending}>
      <LogOut aria-hidden />
      {t("logout")}
    </Button>
  );
}
