import { createElement } from "react";
import { unitTypeIcon } from "./unit-types";

/** A unit type's icon inline beside its name. */
export function UnitTypeIcon({ code, className }: { code: string; className?: string }) {
  return createElement(unitTypeIcon(code), { className, "aria-hidden": true });
}
