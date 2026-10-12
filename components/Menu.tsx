"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A small drop-down for the top bar (spec 3.1): the trigger toggles it, a tap on an item or anywhere
 * else closes it. Plain state, no library.
 */
export function Menu({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onTap = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onTap);
    return () => document.removeEventListener("pointerdown", onTap);
  }, [open]);
  return (
    <span ref={ref} className={`menu ${open ? "open" : ""} ${className ?? ""}`}>
      <button type="button" className="menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
        {/* A drawn chevron, not a font glyph: the same on every phone, and it turns over when open. */}
        <svg className="caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <span className="menu-list" role="menu" onClick={() => setOpen(false)}>
          {children}
        </span>
      )}
    </span>
  );
}
