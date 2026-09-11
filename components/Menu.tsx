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
        <span className="caret" aria-hidden>
          ⌄
        </span>
      </button>
      {open && (
        <span className="menu-list" role="menu" onClick={() => setOpen(false)}>
          {children}
        </span>
      )}
    </span>
  );
}
