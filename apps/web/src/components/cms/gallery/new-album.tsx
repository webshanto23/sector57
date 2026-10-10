"use client";

import { FolderPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { AlbumForm } from "./album-form";

/** "New album" button that opens the album form in place. */
export function NewAlbum() {
  const t = useTranslations("Cms.gallery");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" className="justify-self-start" onClick={() => setOpen(true)}>
        <FolderPlus aria-hidden />
        {t("new")}
      </Button>
    );
  }
  return (
    <Card className="grid gap-3.5">
      <h2 className="text-[15px]">{t("new")}</h2>
      <AlbumForm canSave onCancel={() => setOpen(false)} />
    </Card>
  );
}
