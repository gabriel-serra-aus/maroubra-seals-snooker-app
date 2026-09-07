"use client";

import type { BoxView, BracketPayload, EntryView, MatchView } from "@/lib/bracket/payload";
import { boxLabel, feederLabel } from "@/lib/logic/derive";
import { formatRemaining, matchClock } from "@/lib/timer";
import { fmtRating } from "./client/format";
import { actionKey, type MatchActions } from "./MatchCard";

// Geometry of the tree, in SVG units. Round-one boxes stack down the first column; each later box sits
// level with the middle of its two feeders, exactly as a bracket is drawn on paper. The drawing is scaled
// to the width of the screen (a phone scrolls sideways instead). The admin tree adds a third row to every
// box for the Start / Complete button (spec 3.4), so a box is taller there.
const BOX_W = 190;
const COL_W = 224;
const PAD = 8;
interface Geo {
  boxH: number;
  pitch: number;
}
const geometry = (withButtons: boolean): Geo => {
  const boxH = withButtons ? 68 : 46;
  return { boxH, pitch: boxH + 12 };
};

const cut = (name: string, max: number) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

function boxY(g: Geo, round: number, k: number): number {
  // Centre of box k in round r: the average of its feeders, which works out as a closed form.
  const span = g.pitch * 2 ** (round - 1);
  return PAD + (k - 0.5) * span;
}

function Line({ e, y, x, muted, winner, loser, rating, start }: { e: EntryView; y: number; x: number; muted?: boolean; winner?: boolean; loser?: boolean; rating?: number; start?: number }) {
  return (
    <text x={x} y={y} className={`tree-name ${muted ? "muted" : ""} ${winner ? "winner" : ""} ${loser ? "loser" : ""}`}>
      {winner ? "✔ " : ""}
      {cut(e.name, start ? 13 : 18)} <tspan className="tree-rating">({fmtRating(rating ?? e.rating)})</tspan>
      {/* The handicap start, beside the weaker player who receives it (rules §6, spec 5.6). */}
      {start ? <tspan className="tree-start"> +{start}</tspan> : null}
      {e.source === "buyback" && <tspan className="tree-tag"> bb</tspan>}
      {e.source === "late" && <tspan className="tree-tag late"> la</tspan>}
    </text>
  );
}

/** The one-tap button on a match box in the admin tree: Start, or Complete once in play (spec 3.4). */
function BoxButton({ m, x, y, actions }: { m: MatchView; x: number; y: number; actions: MatchActions }) {
  const action = m.state === "not_started" ? "start" : m.state === "in_play" ? "complete" : null;
  if (!action) return null;
  const pending = actions.pending === actionKey(action, m);
  const label = action === "start" ? (pending ? "Starting…" : "▶ Start") : "■ Complete";
  const fire = () => {
    if (actions.busy) return;
    if (action === "start") actions.onStart(m);
    else actions.onComplete(m);
  };
  // The full inner width of the box, so the tap of the night is the width of the card it sits on.
  const w = BOX_W - 24;
  const h = 18;
  return (
    <g
      className={`tree-btn ${action} ${actions.busy ? "disabled" : ""}`}
      role="button"
      tabIndex={actions.busy ? -1 : 0}
      aria-label={`${action === "start" ? "Start" : "Complete"} ${m.label}`}
      onClick={(e) => {
        // The box behind opens the full card (limit, cancel start, review); the button acts at once.
        e.stopPropagation();
        fire();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          fire();
        }
      }}
    >
      <rect x={x} y={y} width={w} height={h} rx={4} />
      <text x={x + w / 2} y={y + 12.5}>
        {label}
      </text>
    </g>
  );
}

function Box({ b, g, x, y, now, round, bracketSize, onSelect, actions }: { b: BoxView; g: Geo; x: number; y: number; now: number; round: number; bracketSize: number; onSelect?: (m: MatchView) => void; actions?: MatchActions }) {
  const BOX_H = g.boxH;
  const top = y - BOX_H / 2;
  const m = b.match;
  // From round two a box is the meeting place of two boxes below it (O-14): name them while it waits.
  const feeders = round > 1 ? [boxLabel(bracketSize, round - 1, 2 * b.k - 1), boxLabel(bracketSize, round - 1, 2 * b.k)] : null;
  const state = m ? m.state : b.entry ? (b.free_pass ? "pass" : "awaiting") : "empty";
  const clock = m && m.state === "in_play" ? matchClock(m.started_at, m.time_limit_minutes, now) : null;
  const select = m && onSelect ? () => onSelect(m) : undefined;
  return (
    <g
      className={`tree-box ${state} ${select ? "clickable" : ""}`}
      onClick={select}
      role={select ? "button" : undefined}
      tabIndex={select ? 0 : undefined}
      onKeyDown={
        select
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select();
              }
            }
          : undefined
      }
    >
      <rect x={x} y={top} width={BOX_W} height={BOX_H} rx={6} />
      <rect x={x} y={top} width={5} height={BOX_H} rx={2} className="edge" />
      <text x={x + BOX_W - 6} y={top + 12} className="tree-label">
        {clock && <tspan className={`tree-clock ${clock.timed_out ? "timed-out" : ""}`}>{clock.timed_out ? "00:00 ⚠" : formatRemaining(clock.remaining_ms)} · </tspan>}
        {b.label}
      </text>
      {m ? (
        <>
          <Line e={m.a} x={x + 12} y={top + 19} winner={m.winner_id === m.a.entry_id} loser={m.state === "finished" && m.winner_id !== m.a.entry_id} rating={m.rating_a} start={m.start_entry_id === m.a.entry_id ? m.start_points : 0} />
          <Line e={m.b} x={x + 12} y={top + 37} winner={m.winner_id === m.b.entry_id} loser={m.state === "finished" && m.winner_id !== m.b.entry_id} rating={m.rating_b} start={m.start_entry_id === m.b.entry_id ? m.start_points : 0} />
          {actions && <BoxButton m={m} x={x + 12} y={top + 44} actions={actions} />}
          {actions && m.state === "finished" && !m.correction_blocked && (
            <text x={x + 12} y={top + 57} className="tree-sub">
              tap to review the result
            </text>
          )}
        </>
      ) : b.entry ? (
        <>
          <Line e={b.entry} x={x + 12} y={top + 19} />
          <text x={x + 12} y={top + 37} className="tree-sub">
            {b.free_pass ? "free pass" : feeders && b.entry.slot !== null ? `awaiting winner of ${feederLabel(bracketSize, b.entry.slot, round)}` : "awaiting opponent"}
          </text>
        </>
      ) : feeders ? (
        <>
          <text x={x + 12} y={top + 19} className="tree-sub">
            winner of {feeders[0]}
          </text>
          <text x={x + 12} y={top + 37} className="tree-sub">
            winner of {feeders[1]}
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

/**
 * True when a match sits in a box its players' slots do not belong to: a night drawn before the fixed
 * bracket (O-14), whose later rounds were paired at random. No tree can be right for it.
 */
function drawnBeforeFixedBracket(b: BracketPayload): boolean {
  return b.rounds.some((r) =>
    r.boxes.some((box) => {
      const m = box.match;
      if (!m) return false;
      const fits = (e: EntryView) => e.slot === null || Math.ceil(e.slot / 2 ** r.round) === box.k;
      return !fits(m.a) || !fits(m.b);
    }),
  );
}

/**
 * The whole night as one fixed tree (spec 3.4, 3.8, 5.4). Fills the width of the screen and scrolls
 * sideways on a phone. With `onSelect`, every match box is a button that opens its card (admin); with
 * `actions` as well, each box carries its own Start / Complete button so the common taps need no dialog.
 */
export function BracketTree({ b, now, onSelect, actions }: { b: BracketPayload; now: number; onSelect?: (m: MatchView) => void; actions?: MatchActions }) {
  const c = b.competition;
  if (!c) return null;
  const g = geometry(!!actions);
  const BOX_H = g.boxH;
  const R = c.rounds_total;
  const B = c.bracket_size;
  const height = PAD * 2 + (B / 2) * g.pitch;
  const width = (R + 1) * COL_W;
  const colX = (round: number) => PAD + (round - 1) * COL_W;
  const rounds = new Map(b.rounds.map((r) => [r.round, r]));
  const boxesOf = (round: number): BoxView[] => {
    const rv = rounds.get(round);
    if (rv) return rv.boxes;
    const offset = B - B / 2 ** (round - 1);
    return Array.from({ length: B / 2 ** round }, (_, i) => ({ k: i + 1, number: offset + i + 1, label: boxLabel(B, round, i + 1), match: null, entry: null, free_pass: false }));
  };
  const lines: string[] = [];
  for (let r = 1; r < R; r++) {
    const xRight = colX(r) + BOX_W;
    const xJoin = xRight + (COL_W - BOX_W) / 2;
    const xNext = colX(r + 1);
    for (let k = 1; k <= B / 2 ** r; k += 2) {
      const y1 = boxY(g, r, k);
      const y2 = boxY(g, r, k + 1);
      const yTo = boxY(g, r + 1, (k + 1) / 2);
      lines.push(`M${xRight},${y1} H${xJoin} V${y2} H${xRight} M${xJoin},${yTo} H${xNext}`);
    }
  }
  const finalY = boxY(g, R, 1);
  const winnerX = colX(R + 1);
  lines.push(`M${colX(R) + BOX_W},${finalY} H${winnerX}`);
  return (
    <>
      {drawnBeforeFixedBracket(b) && (
        <div className="notice small">
          This night was drawn before the fixed bracket: its later rounds were paired at random, so the tree cannot match the list. The list is right.
        </div>
      )}
      <div className="tree-scroll">
        <svg className="tree" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tournament bracket">
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
            boxesOf(r).map((box) => <Box key={`${r}-${box.k}`} b={box} g={g} x={colX(r)} y={boxY(g, r, box.k) + 10} now={now} round={r} bracketSize={B} onSelect={onSelect} actions={actions} />),
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
    </>
  );
}
