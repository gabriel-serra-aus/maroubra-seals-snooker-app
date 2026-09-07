"use client";

import type { ComponentPropsWithRef } from "react";

/** A small inline spinner, for a button or a select that is waiting on the server. */
export function Spinner({ className }: { className?: string }) {
  return <span className={`spinner ${className ?? ""}`} role="status" aria-label="Working" />;
}

/**
 * A button that shows what it is doing: while `pending` it is disabled and carries a spinner, so the tap
 * that caused the request is the one that shows it (spec 3.4). Other buttons are simply disabled.
 */
export function Btn({ pending, className, disabled, children, ...rest }: ComponentPropsWithRef<"button"> & { pending?: boolean }) {
  return (
    <button type="button" className={`btn ${className ?? ""} ${pending ? "pending" : ""}`} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}
