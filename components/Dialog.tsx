"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Btn } from "./Btn";

/**
 * The app's own confirm and prompt (spec 3.5: "every dialog is centred on the screen").
 *
 * The browser's `confirm()` and `prompt()` are out of bounds here: on the club phone they are a system
 * sheet with no room for a list of consequences, they cannot be styled or read at a glance, and a phone
 * set to block them silently answers "cancel". These are the same `.sheet` cards the rest of the app
 * uses, and they return a promise so a caller reads exactly like the old one:
 *
 *     if (!(await ask({ title: "Abandon the night?" }))) return;
 */

export interface AskOptions {
  title: string;
  /** The explanation under the title. */
  body?: ReactNode;
  /** One line per consequence, bulleted — what the tap will actually do. */
  points?: string[];
  /** A muted line under the points (e.g. "Every override is logged against your name."). */
  note?: string;
  /** Label of the button that goes ahead. Defaults to "OK". */
  confirm?: string;
  /** Label of the button that backs out. Defaults to "Cancel". */
  cancel?: string;
  /** Red confirm button, for anything that cannot be undone. */
  danger?: boolean;
}

export interface AskTextOptions extends Omit<AskOptions, "danger"> {
  /** The field's own label. */
  label: string;
  initial?: string;
  placeholder?: string;
  numeric?: boolean;
  /** Returns a message to show under the field, or null when the value is good. Keeps the dialog open. */
  validate?: (value: string) => string | null;
}

type Open =
  | { kind: "ask"; opts: AskOptions; done: (v: boolean) => void }
  | { kind: "text"; opts: AskTextOptions; done: (v: string | null) => void };

/** Whatever a dialog resolves to when it is dismissed rather than confirmed. */
const cancelled = (o: Open) => (o.kind === "ask" ? o.done(false) : o.done(null));

/**
 * `ask` and `askText` open a dialog and resolve when the organiser answers; `dialog` is the element to
 * render (null while nothing is open). Opening a second dialog cancels the first, so no caller is ever
 * left waiting on a promise that cannot resolve.
 */
export function useDialog() {
  const [open, setOpen] = useState<Open | null>(null);
  // The live dialog, outside React state, so resolving one never depends on a render having happened.
  const live = useRef<Open | null>(null);

  const start = useCallback((next: Open) => {
    if (live.current) cancelled(live.current);
    live.current = next;
    setOpen(next);
  }, []);

  const ask = useCallback((opts: AskOptions) => new Promise<boolean>((done) => start({ kind: "ask", opts, done })), [start]);
  const askText = useCallback((opts: AskTextOptions) => new Promise<string | null>((done) => start({ kind: "text", opts, done })), [start]);

  const answer = useCallback((value: boolean | string | null) => {
    const o = live.current;
    live.current = null;
    setOpen(null);
    if (!o) return;
    if (o.kind === "ask") o.done(value === true);
    else o.done(typeof value === "string" ? value : null);
  }, []);

  // A dialog left open by a screen that goes away resolves as cancelled rather than hanging.
  useEffect(() => () => { if (live.current) cancelled(live.current); }, []);

  return { ask, askText, dialog: open ? <DialogCard o={open} onAnswer={answer} /> : null };
}

function DialogCard({ o, onAnswer }: { o: Open; onAnswer: (v: boolean | string | null) => void }) {
  const titleId = useId();
  const { title, body, points, note, confirm: confirmLabel, cancel: cancelLabel } = o.opts;
  const danger = o.kind === "ask" && o.opts.danger;
  const [value, setValue] = useState(o.kind === "text" ? (o.opts.initial ?? "") : "");
  const [problem, setProblem] = useState<string | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dismiss = useCallback(() => onAnswer(o.kind === "ask" ? false : null), [o.kind, onAnswer]);

  const submit = () => {
    if (o.kind === "ask") return onAnswer(true);
    const bad = o.opts.validate?.(value) ?? null;
    if (bad) return setProblem(bad);
    onAnswer(value);
  };

  // Escape backs out, the way the browser's own dialog does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  // The answer is under the thumb the moment the card opens: the field to type in, or the button to tap.
  useEffect(() => {
    (inputRef.current ?? okRef.current)?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="sheet-backdrop" onClick={dismiss}>
      <div className="sheet dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId}>{title}</h2>
        {body && <div className="dialog-body">{body}</div>}
        {points && points.length > 0 && (
          <ul className="dialog-points">
            {points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {o.kind === "text" && (
          <label className="field">
            <span>{o.opts.label}</span>
            <input
              ref={inputRef}
              type={o.opts.numeric ? "number" : "text"}
              value={value}
              placeholder={o.opts.placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                setProblem(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </label>
        )}
        {problem && <div className="error">{problem}</div>}
        {note && <p className="muted small">{note}</p>}
        <div className="row dialog-actions">
          <Btn ref={okRef} className={`primary ${danger ? "danger" : ""}`} onClick={submit}>
            {confirmLabel ?? "OK"}
          </Btn>
          <Btn onClick={dismiss}>{cancelLabel ?? "Cancel"}</Btn>
        </div>
      </div>
    </div>
  );
}
