"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/lib/api/session";

/**
 * Drops the cached public pages after the dashboard changed their content, so the
 * change shows at once instead of within the 60-second revalidate window. Every page
 * sits under the `[locale]` layout, so one call covers both languages. Logged-in users
 * only; the content itself was already checked and saved by the API.
 */
export async function refreshPublicSite(): Promise<void> {
  if (!(await getMe())) return;
  revalidatePath("/[locale]", "layout");
}
