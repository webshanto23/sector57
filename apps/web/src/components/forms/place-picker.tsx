"use client";

import { pick, type Locale, type PublicPlace } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Field, inputClass } from "@/components/kit";
import { api } from "@/lib/api/client";

/** One dropdown of the chain: the places under the previous choice, and which one is picked. */
type Step = { options: PublicPlace[]; selected: string };

async function children(parentId?: string): Promise<PublicPlace[]> {
  const { data } = await api.GET("/public/locations", { params: { query: parentId ? { parentId } : {} } });
  if (!data) throw new Error("Could not load places");
  return data.items;
}

/** What the picked place is: its id, whether it is a flat, and whether it sits below the top of the tree. */
export type PickedPlace = { id: string; isUnit: boolean; belowTop: boolean } | null;

/**
 * Block > road > plot > flat dropdowns from the society's location tree, one per level, each
 * filled once the one above is chosen. A single place at the top (the sector) is chosen
 * automatically and not shown. Reports the deepest choice.
 */
export function PlacePicker({
  id,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  invalid?: boolean;
  describedBy?: string;
  onChange: (place: PickedPlace) => void;
}) {
  const t = useTranslations("Forms");
  const locale = useLocale() as Locale;
  const [steps, setSteps] = useState<Step[]>([]);
  // The single top place, skipped in the dropdowns (its children are the first step).
  const [hiddenTop, setHiddenTop] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const baseId = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const top = await children();
        if (cancelled) return;
        const only = top.length === 1 && !top[0]!.isUnit && top[0]!.hasChildren ? top[0]! : null;
        if (only) {
          const below = await children(only.id);
          if (cancelled) return;
          setHiddenTop(only.id);
          setSteps([{ options: below, selected: "" }]);
        } else {
          setSteps([{ options: top, selected: "" }]);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function choose(index: number, value: string) {
    const kept = steps.slice(0, index + 1).map((step, i) => (i === index ? { ...step, selected: value } : step));
    setSteps(kept);
    onChange(deepest(kept));
    const place = kept[index]!.options.find((option) => option.id === value);
    if (!place?.hasChildren) return;
    setLoading(true);
    try {
      const options = await children(place.id);
      setSteps((current) => (current.length === index + 1 && current[index]!.selected === value ? [...current, { options, selected: "" }] : current));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  /** The deepest place chosen. A first-dropdown place is below the top only when the single top was skipped. */
  const deepest = (list: Step[]): PickedPlace => {
    for (let index = list.length - 1; index >= 0; index--) {
      const step = list[index]!;
      const place = step.options.find((option) => option.id === step.selected);
      if (place) return { id: place.id, isUnit: place.isUnit, belowTop: hiddenTop !== null || index > 0 };
    }
    return null;
  };

  /** The label of a dropdown: the level name of its places ("Block", "Road / Plot" when mixed). */
  const labelOf = (options: PublicPlace[]) => {
    const names = [...new Set(options.map((option) => pick(option.levelBn, option.levelEn, locale)))];
    return names.length > 0 ? names.join(" / ") : t("choose");
  };

  if (failed) return <p className="text-[13px] text-bad">{t("placesFailed")}</p>;

  return (
    <div className="grid gap-3.5 min-[600px]:grid-cols-2" aria-busy={loading || undefined}>
      {steps
        .filter((step) => step.options.length > 0)
        .map((step, index) => {
          const selectId = index === 0 ? id : `${baseId}-${index}`;
          return (
            <Field key={index} label={labelOf(step.options)} htmlFor={selectId}>
              <select
                id={selectId}
                className={inputClass}
                value={step.selected}
                aria-invalid={invalid ? true : undefined}
                aria-describedby={describedBy}
                onChange={(event) => void choose(index, event.target.value)}
              >
                <option value="">{t("choose")}</option>
                {step.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
          );
        })}
    </div>
  );
}
