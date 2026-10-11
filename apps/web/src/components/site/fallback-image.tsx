"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";

/**
 * An uploaded image that shows `fallback` when its file can't be loaded (never
 * uploaded, like the seeded demo albums, or removed from storage). With `href`
 * the image links to the full file; the fallback doesn't, since there is none.
 */
export function FallbackImage({
  src,
  alt,
  fallback,
  href,
  ...props
}: Omit<ImageProps, "src" | "onError"> & { src: string; fallback: ReactNode; href?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return fallback;

  const image = <Image src={src} alt={alt} {...props} onError={() => setFailedSrc(src)} />;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {image}
    </a>
  ) : (
    image
  );
}
