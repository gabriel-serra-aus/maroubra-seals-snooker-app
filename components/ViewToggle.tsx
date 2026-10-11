"use client";

import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { BracketTree, type SeatControls } from "./BracketTree";
import { useStoredChoice } from "./client/hooks";

/** Tree (two pages), Full tree (every round at once) or List (O-28). */
export type BracketViewMode = "tree" | "full" | "list";

const LABELS: Record<BracketViewMode, string> = { tree: "Tree", full: "Full tree", list: "List" };

/** Tree | Full tree | List switch above the bracket (spec 3.4, 3.8, O-28). Without `list`, the two trees only. */
export function ViewToggle({ value, onChange, list = true }: { value: BracketViewMode; onChange: (v: BracketViewMode) => void; list?: boolean }) {
  const modes: BracketViewMode[] = list ? ["tree", "full", "list"] : ["tree", "full"];
  return (
    <div className="toggle" role="tablist" aria-label="Bracket view">
      {modes.map((v) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
}

/**
 * The tree with its Tree | Full tree switch, for the screens without a list: the master override (O-25)
 * and history. The choice is remembered on the device.
 */
export function TreeViews({ b, now, onSelect, seats }: { b: BracketPayload; now: number; onSelect?: (m: MatchView) => void; seats?: SeatControls }) {
  const [view, setView] = useStoredChoice<"tree" | "full">("tree-view", "tree");
  return (
    <>
      <ViewToggle value={view} onChange={(v) => setView(v === "full" ? "full" : "tree")} list={false} />
      <BracketTree b={b} now={now} onSelect={onSelect} seats={seats} layout={view === "full" ? "full" : "paged"} />
    </>
  );
}
