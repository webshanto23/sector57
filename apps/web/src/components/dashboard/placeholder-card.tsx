import type { LucideIcon } from "lucide-react";
import { Card, IconBox } from "@/components/kit";

/** Mockup `placeholder()`: the card shown on dashboard pages that are not built yet. */
export function PlaceholderCard({ icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <Card className="grid max-w-[560px] justify-items-start gap-3 min-[600px]:p-6">
      <IconBox icon={icon} />
      <h2 className="text-[17px]">{title}</h2>
      <p className="text-muted-foreground">{body}</p>
    </Card>
  );
}
