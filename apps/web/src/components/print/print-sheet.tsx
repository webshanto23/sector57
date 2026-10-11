"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * What the browser prints: `children`, put straight under <body> so the print CSS
 * (`.print-portal` in globals.css) can hide everything else. Never shown on screen.
 */
export function PrintSheet({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return mounted ? createPortal(<div className="print-portal">{children}</div>, document.body) : null;
}
