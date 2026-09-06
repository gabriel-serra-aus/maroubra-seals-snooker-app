"use client";

import type { BoxView, BracketPayload, EntryView } from "@/lib/bracket/payload";
import { fmtRating } from "./client/format";

// Geometry of the tree, in SVG units (pixels at 1:1). Round-one boxes stack down the first column; each
// later box sits level with the middle of its two feeders, exactly as a bracket is drawn on paper.
const BOX_W = 168;
const BOX_H = 46;
const COL_W = 200;
const PITCH = BOX_H + 12;
const PAD = 8;

const cut = (name: string, max: number) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

function boxY(round: number, k: number): number {
  // Centre of box k in round r: the average of its feeders, which works out as a closed form.
  const span = PITCH * 2 ** (round - 1);
  return PAD + (k - 0.5) * span;
}

function Line({ e, y, x, muted, winner, loser, rating }: { e: EntryView; y: number; x: number; muted?: boolean; winner?: boolean; loser?: boolean; rating?: number }) {
  return (
    <text x={x} y={y} className={`tree-name ${muted ? "muted" : ""} ${winner ? "winner" : ""} ${loser ? "loser" : ""}`}>
      {winner ? "✔ " : ""}
      {cut(e.name, 17)} <tspan className="tree-rating">({fmtRating(rating ?? e.rating)})</tspan>
      {e.source === "buyback" && <tspan className="tree-tag"> bb</tspan>}
    </text>
  );
}

function Box({ b, x, y }: { b: BoxView; x: number; y: number }) {
  const top = y - BOX_H / 2;
  const m = b.match;
  const state = m ? m.state : b.entry ? (b.free_pass ? "pass" : "awaiting") : "empty";
  return (
    <g className={`tree-box ${state}`}>
      <rect x={x} y={top} width={BOX_W} height={BOX_H} rx={6} />
      <rect x={x} y={top} width={5} height={BOX_H} rx={2} className="edge" />
      <text x={x + BOX_W - 6} y={top + 12} className="tree-label">
        M{b.number}
      </text>
      {m ? (
        <>
          <Line e={m.a} x={x + 12} y={top + 19} winner={m.winner_id === m.a.entry_id} loser={m.state === "finished" && m.winner_id !== m.a.entry_id} rating={m.rating_a} />
          <Line e={m.b} x={x + 12} y={top + 37} winner={m.winner_id === m.b.entry_id} loser={m.state === "finished" && m.winner_id !== m.b.entry_id} rating={m.rating_b} />
        </>
      ) : b.entry ? (
        <>
          <Line e={b.entry} x={x + 12} y={top + 19} />
          <text x={x + 12} y={top + 37} className="tree-sub">
            {b.free_pass ? "free pass" : "awaiting opponent"}
          </text>
        </>
      ) : (
        <text x={x + 12} y={top + 28} className="tree-sub">
          open
        </text>
      )}
    </g>
  );
}

/** The whole night as one fixed tree (spec 3.4, 3.8, 5.4): read only, scrolls sideways on a phone. */
export function BracketTree({ b }: { b: BracketPayload }) {
  const c = b.competition;
  if (!c) return null;
  const R = c.rounds_total;
  const B = c.bracket_size;
  const height = PAD * 2 + (B / 2) * PITCH;
  const width = (R + 1) * COL_W;
  const colX = (round: number) => PAD + (round - 1) * COL_W;
  const rounds = new Map(b.rounds.map((r) => [r.round, r]));
  const boxesOf = (round: number): BoxView[] => {
    const rv = rounds.get(round);
    if (rv) return rv.boxes;
    const offset = B - B / 2 ** (round - 1);
    return Array.from({ length: B / 2 ** round }, (_, i) => ({ k: i + 1, number: offset + i + 1, match: null, entry: null, free_pass: false }));
  };
  const lines: string[] = [];
  for (let r = 1; r < R; r++) {
    const xRight = colX(r) + BOX_W;
    const xJoin = xRight + (COL_W - BOX_W) / 2;
    const xNext = colX(r + 1);
    for (let k = 1; k <= B / 2 ** r; k += 2) {
      const y1 = boxY(r, k);
      const y2 = boxY(r, k + 1);
      const yTo = boxY(r + 1, (k + 1) / 2);
      lines.push(`M${xRight},${y1} H${xJoin} V${y2} H${xRight} M${xJoin},${yTo} H${xNext}`);
    }
  }
  const finalY = boxY(R, 1);
  const winnerX = colX(R + 1);
  lines.push(`M${colX(R) + BOX_W},${finalY} H${winnerX}`);
  return (
    <div className="tree-scroll">
      <svg className="tree" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tournament bracket">
        {Array.from({ length: R }, (_, i) => i + 1).map((r) => (
          <text key={`h${r}`} x={colX(r)} y={PAD + 4} className="tree-head">
            {r === R ? "Final" : `Round ${r}`}
          </text>
        ))}
        <text x={winnerX} y={PAD + 4} className="tree-head">
          Winner
        </text>
        <path d={lines.join(" ")} className="tree-lines" />
        {Array.from({ length: R }, (_, i) => i + 1).map((r) =>
          boxesOf(r).map((box) => <Box key={`${r}-${box.k}`} b={box} x={colX(r)} y={boxY(r, box.k) + 10} />),
        )}
        <g className={`tree-box ${c.winner ? "winner" : "empty"}`}>
          <rect x={winnerX} y={finalY + 10 - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} />
          {c.winner ? (
            <Line e={c.winner} x={winnerX + 12} y={finalY + 10 + 5} winner />
          ) : (
            <text x={winnerX + 12} y={finalY + 10 + 5} className="tree-sub">
              to be decided
            </text>
          )}
        </g>
      </svg>
    </div>
  );
}
