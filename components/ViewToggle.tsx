"use client";

export type BracketViewMode = "list" | "tree";

/** List | Tree switch above the bracket (spec 3.4, 3.8). */
export function ViewToggle({ value, onChange }: { value: BracketViewMode; onChange: (v: BracketViewMode) => void }) {
  return (
    <div className="toggle" role="tablist" aria-label="Bracket view">
      <button type="button" role="tab" aria-selected={value === "list"} className={value === "list" ? "on" : ""} onClick={() => onChange("list")}>
        List
      </button>
      <button type="button" role="tab" aria-selected={value === "tree"} className={value === "tree" ? "on" : ""} onClick={() => onChange("tree")}>
        Tree
      </button>
    </div>
  );
}
