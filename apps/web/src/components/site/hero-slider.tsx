"use client";

import { localDigits, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "cn";
import { FallbackImage } from "./fallback-image";

export type HeroSlide = { url: string; alt: string };

const INTERVAL_MS = 5000;
const SWIPE_PX = 40;

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange: () => void) => {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => true);

/**
 * The home page hero: an endless slider of the hero album's photos. A copy of the
 * first slide sits after the last, so moving on from the last slides forward onto
 * the copy and then jumps back to the real first one without animation. It moves
 * every 5 s and stops while hovered or focused, or when the visitor asks for
 * reduced motion. `fallback` stands in for a photo whose file can't be loaded.
 */
export function HeroSlider({ slides, fallback, className }: { slides: HeroSlide[]; fallback: ReactNode; className?: string }) {
  const t = useTranslations("Site.home");
  const locale = useLocale() as Locale;
  const reducedMotion = useReducedMotion();
  const count = slides.length;
  // 0..count; `count` is the copy of the first slide.
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [held, setHeld] = useState(false);
  const swipeFrom = useRef<number | null>(null);
  const current = index % count;

  const goTo = (target: number) => {
    setAnimate(!reducedMotion);
    setIndex(reducedMotion ? target % count : target);
  };
  const next = () => goTo(index + 1);
  const previous = () => {
    if (index > 0) return goTo(index - 1);
    // From the first slide: jump to its copy, then slide back onto the last one.
    setAnimate(false);
    setIndex(count);
    requestAnimationFrame(() => requestAnimationFrame(() => goTo(count - 1)));
  };

  const playing = count > 1 && !held && !reducedMotion;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setAnimate(true);
      setIndex((i) => Math.min(i + 1, count));
    }, INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [playing, index, count]);

  const onTransitionEnd = () => {
    if (index !== count) return;
    setAnimate(false);
    setIndex(0);
  };

  const track = count > 1 ? [...slides, slides[0]!] : slides;

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t("slides")}
      className={cn("relative aspect-[4/3] h-full w-full overflow-hidden bg-[var(--accent-brand-soft)]", className)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") swipeFrom.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (swipeFrom.current === null || count < 2) return;
        const moved = event.clientX - swipeFrom.current;
        swipeFrom.current = null;
        if (moved <= -SWIPE_PX) next();
        else if (moved >= SWIPE_PX) previous();
      }}
    >
      <div
        className={cn("flex h-full touch-pan-y", animate && "transition-transform duration-700 ease-in-out")}
        style={{ transform: `translateX(-${index * 100}%)` }}
        onTransitionEnd={onTransitionEnd}
      >
        {track.map((slide, position) => {
          const hidden = position % count !== current || position === count;
          return (
            <div
              // The copy shares the first slide's url, so the position is the key.
              key={position}
              role="group"
              aria-roledescription="slide"
              aria-hidden={hidden}
              inert={hidden}
              className="relative h-full w-full flex-none"
            >
              <FallbackImage
                src={slide.url}
                alt={slide.alt}
                fill
                unoptimized
                preload={position === 0}
                sizes="(min-width: 761px) 50vw, 100vw"
                className="object-cover brightness-95 contrast-92 saturate-85 sepia-8 dark:brightness-85"
                fallback={fallback}
              />
              {/* Green tint so photos sit in the site's muted palette; only over a photo, not the fallback drawing. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 hidden bg-[var(--accent-brand)] opacity-12 mix-blend-multiply [img~&]:block" />
            </div>
          );
        })}
      </div>

      {count > 1 ? (
        <>
          {/* Darkens the bottom edge so the dots stay readable on light photos. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[34px] bg-linear-to-t from-[rgba(15,20,18,.35)] to-transparent"
          />
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
            {slides.map((slide, position) => (
              <button
                key={slide.url + position}
                type="button"
                aria-label={t("showSlide", { n: localDigits(position + 1, locale) })}
                aria-current={position === current}
                onClick={() => goTo(position)}
                className={cn(
                  // The ::before widens the tap target past the 7px dot.
                  "relative h-[7px] rounded-full transition-[width,background-color] duration-300 before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none",
                  position === current ? "w-5 bg-[var(--accent-brand-bright)]" : "w-[7px] bg-white/70 hover:bg-white",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
