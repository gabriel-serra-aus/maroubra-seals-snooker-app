"use client";

import { useEffect, useRef, useState } from "react";
import type { BoxView, BracketPayload, EntryView, MatchView } from "@/lib/bracket/payload";
import { boxLabel, feederLabel } from "@/lib/logic/derive";
import { formatRemaining, matchClock } from "@/lib/timer";
import { AvatarSvg } from "./Avatar";
import { fmtRating } from "./client/format";
import type { MatchActions } from "./MatchCard";

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
  const boxH = withButtons ? 84 : 54;
  return { boxH, pitch: boxH + 12 };
};

const cut = (name: string, max: number) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

function boxY(g: Geo, round: number, k: number): number {
  // Centre of box k in round r: the average of its feeders, which works out as a closed form.
  const span = g.pitch * 2 ** (round - 1);
  return PAD + (k - 0.5) * span;
}

function Line({ e, y, x, muted, winner, loser, rating, start }: { e: EntryView; y: number; x: number; muted?: boolean; winner?: boolean; loser?: boolean; rating?: number; start?: number }) {
  // A small face before the name (O-18); the name is cut a little shorter to make room.
  return (
    <g>
      <AvatarSvg name={e.name} photo={e.photo} cx={x + 7} cy={y - 4} r={7} />
      <text x={x + 18} y={y} className={`tree-name ${muted ? "muted" : ""} ${winner ? "winner" : ""} ${loser ? "loser" : ""}`}>
        {winner ? "✔ " : ""}
        {cut(e.name, start ? 11 : 16)} <tspan className="tree-rating">({fmtRating(rating ?? e.rating)})</tspan>
        {/* The handicap start, beside the weaker player who receives it (rules §6, spec 5.6). */}
        {start ? <tspan className="tree-start"> +{start}</tspan> : null}
        {e.source === "buyback" && <tspan className="tree-tag"> bb</tspan>}
        {e.source === "late" && <tspan className="tree-tag late"> la</tspan>}
      </text>
    </g>
  );
}

/** The one-tap button on a match box in the admin tree: Start, or Complete once in play (spec 3.4). */
function BoxButton({ m, x, y, actions }: { m: MatchView; x: number; y: number; actions: MatchActions }) {
  const action = m.state === "not_started" ? "start" : m.state === "in_play" ? "complete" : null;
  if (!action) return null;
  const locked = actions.locked(m);
  const pending = actions.pending(action, m);
  const label = action === "start" ? (pending ? "Starting…" : "▶ Start") : pending ? "Saving…" : "■ Record result";
  const fire = () => {
    if (locked) return;
    if (action === "start") actions.onStart(m);
    else actions.onComplete(m);
  };
  // The full inner width of the box, so the tap of the night is the width of the card it sits on.
  const w = BOX_W - 24;
  const h = 26;
  return (
    <g
      className={`tree-btn ${action} ${locked ? "disabled" : ""}`}
      role="button"
      tabIndex={locked ? -1 : 0}
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
      <text x={x + w / 2} y={y + h / 2 + 4}>
        {label}
      </text>
    </g>
  );
}

/**
 * Moving a player who has not played (spec 3.9, 5.10, O-17), on the override screen only. `selected` is the
 * entry picked by a click; `onPick` selects or clears it; `onMove` asks to move an entry into an open slot.
 */
export interface SeatControls {
  selected: string | null;
  onPick: (e: EntryView | null) => void;
  onMove: (e: EntryView, slot: number) => void;
}

/** A drag in progress: the player held, where the pointer is, and the open slot under it. */
interface DragState {
  entry: EntryView;
  x0: number;
  y0: number;
  x: number;
  y: number;
  active: boolean;
  over: number | null;
}

/** Everything a round-one box needs to draw its seats for moving. */
interface MoveView {
  seats: SeatControls;
  drag: DragState | null;
  picked: EntryView | null;
  seatsOf: (k: number) => [SeatInfo, SeatInfo];
  onPointerDown: (e: React.PointerEvent, entry: EntryView) => void;
}

/** What a round-one seat offers the move: a player who can be moved, an open place, or neither. */
interface SeatInfo {
  slot: number;
  entry: EntryView | null;
  movable: boolean;
  open: boolean;
}

/** One seat of a round-one box in the override tree: a drag handle, a click target and a drop target. */
function Seat({ seat, m, x, y, top, move, onPointerDown }: { seat: SeatInfo; m: MatchView | null; x: number; y: number; top: number; move: MoveView; onPointerDown: (e: React.PointerEvent, entry: EntryView) => void }) {
  const { seats, drag, picked } = move;
  const moving = drag?.active ? drag.entry.entry_id : seats.selected;
  const selected = !!seat.entry && moving === seat.entry.entry_id;
  const target = seat.open && !!moving;
  const over = target && drag?.over === seat.slot;
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (seat.entry && seat.movable) seats.onPick(selected ? null : seat.entry);
    else if (seat.open && picked) seats.onMove(picked, seat.slot);
    else seats.onPick(null);
  };
  const cls = ["tree-seat", seat.movable ? "movable" : "", seat.open ? "open" : "", selected ? "selected" : "", target ? "target" : "", over ? "over" : ""].join(" ");
  return (
    <g className={cls} data-slot={seat.slot} data-open={seat.open ? "1" : undefined} onClick={click} onPointerDown={seat.entry && seat.movable ? (e) => onPointerDown(e, seat.entry!) : undefined}>
      <rect x={x + 6} y={top} width={BOX_W - 12} height={17} rx={3} className="seat-bg" />
      {seat.entry ? (
        <Line e={seat.entry} x={x + 12} y={y} rating={m ? (m.a.entry_id === seat.entry.entry_id ? m.rating_a : m.rating_b) : undefined} start={m && m.start_entry_id === seat.entry.entry_id ? m.start_points : 0} />
      ) : (
        <text x={x + 12} y={y} className="tree-sub">
          {seat.open ? (target ? "open — move here" : "open") : "—"}
        </text>
      )}
    </g>
  );
}

function Box({ b, g, x, y, now, round, bracketSize, onSelect, actions, move }: { b: BoxView; g: Geo; x: number; y: number; now: number; round: number; bracketSize: number; onSelect?: (m: MatchView) => void; actions?: MatchActions; move?: MoveView }) {
  const BOX_H = g.boxH;
  const top = y - BOX_H / 2;
  const m = b.match;
  // From round two a box is the meeting place of two boxes below it (O-14): name them while it waits.
  const feeders = round > 1 ? [boxLabel(bracketSize, round - 1, 2 * b.k - 1), boxLabel(bracketSize, round - 1, 2 * b.k)] : null;
  // On the override screen a round-one box not yet under way is drawn seat by seat, so each player can be
  // moved and each open seat can take one (spec 5.10, O-17). Every other box draws as usual.
  const seated = move && round === 1 && !b.free_pass && (!m || m.state === "not_started") ? move.seatsOf(b.k) : null;
  const state = m ? m.state : seated ? (seated.some((x) => x.entry) ? "awaiting" : "empty") : b.entry ? (b.free_pass ? "pass" : "awaiting") : "empty";
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
        {m?.table_number && m.state !== "finished" ? <tspan className="tree-table">T{m.table_number} · </tspan> : null}
        {clock && <tspan className={`tree-clock ${clock.timed_out ? "timed-out" : ""}`}>{clock.timed_out ? "00:00 ⚠" : formatRemaining(clock.remaining_ms)} · </tspan>}
        {b.label}
      </text>
      {seated ? (
        <>
          <Seat seat={seated[0]} m={m} x={x} y={top + 26} top={top + 14} move={move!} onPointerDown={move!.onPointerDown} />
          <Seat seat={seated[1]} m={m} x={x} y={top + 43} top={top + 31} move={move!} onPointerDown={move!.onPointerDown} />
        </>
      ) : m ? (
        <>
          <Line e={m.a} x={x + 12} y={top + 26} winner={m.winner_id === m.a.entry_id} loser={m.state === "finished" && m.winner_id !== m.a.entry_id} rating={m.rating_a} start={m.start_entry_id === m.a.entry_id ? m.start_points : 0} />
          <Line e={m.b} x={x + 12} y={top + 43} winner={m.winner_id === m.b.entry_id} loser={m.state === "finished" && m.winner_id !== m.b.entry_id} rating={m.rating_b} start={m.start_entry_id === m.b.entry_id ? m.start_points : 0} />
          {actions && <BoxButton m={m} x={x + 12} y={top + 51} actions={actions} />}
          {actions && m.state === "finished" && !m.correction_blocked && (
            <text x={x + 12} y={top + 64} className="tree-sub">
              tap to review the result
            </text>
          )}
        </>
      ) : b.entry ? (
        <>
          <Line e={b.entry} x={x + 12} y={top + 26} />
          <text x={x + 12} y={top + 43} className="tree-sub">
            {b.free_pass ? "free pass" : feeders && b.entry.slot !== null ? `awaiting winner of ${feederLabel(bracketSize, b.entry.slot, round)}` : "awaiting opponent"}
          </text>
        </>
      ) : feeders ? (
        <>
          <text x={x + 12} y={top + 26} className="tree-sub">
            winner of {feeders[0]}
          </text>
          <text x={x + 12} y={top + 43} className="tree-sub">
            winner of {feeders[1]}
          </text>
        </>
      ) : (
        <text x={x + 12} y={top + BOX_H / 2 + 4} className="tree-sub">
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
export function BracketTree({ b, now, onSelect, actions, seats }: { b: BracketPayload; now: number; onSelect?: (m: MatchView) => void; actions?: MatchActions; seats?: SeatControls }) {
  const move = useMove(b, seats);
  const c = b.competition;
  if (!c) return null;
  const g = geometry(!!actions);
  const R = c.rounds_total;
  const B = c.bracket_size;
  const height = PAD * 2 + (B / 2) * g.pitch;
  // The winner is named above the bracket, so the tree ends at the final.
  const width = R * COL_W;
  const colX = (round: number) => PAD + (round - 1) * COL_W;
  const rounds = new Map(b.rounds.map((r) => [r.round, r]));
  const boxesOf = (round: number): BoxView[] => {
    const rv = rounds.get(round);
    if (rv) return rv.boxes;
    const offset = B - B / 2 ** (round - 1);
    return Array.from({ length: B / 2 ** round }, (_, i) => ({ k: i + 1, number: offset + i + 1, label: boxLabel(B, round, i + 1), match: null, entry: null, free_pass: false }));
  };
  // While a player is picked to move, a click on a box puts them down rather than opening its card.
  const select = onSelect && seats?.selected ? () => seats.onPick(null) : onSelect;
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
  return (
    <>
      {drawnBeforeFixedBracket(b) && (
        <div className="notice small">
          This night was drawn before the fixed bracket: its later rounds were paired at random, so the tree cannot match the list. The list is right.
        </div>
      )}
      <div className="tree-scroll">
        {move?.drag?.active && (
          <div className="drag-ghost" style={{ left: move.drag.x, top: move.drag.y }}>
            {move.drag.entry.name}
          </div>
        )}
        <svg className={`tree ${seats ? "seating" : ""} ${move?.drag?.active ? "dragging" : ""}`} style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tournament bracket">
          {Array.from({ length: R }, (_, i) => i + 1).map((r) => (
            <text key={`h${r}`} x={colX(r)} y={PAD + 4} className="tree-head">
              {r === R ? "Final" : `Round ${r}`}
            </text>
          ))}
          <path d={lines.join(" ")} className="tree-lines" />
          {Array.from({ length: R }, (_, i) => i + 1).map((r) =>
            boxesOf(r).map((box) => <Box key={`${r}-${box.k}`} b={box} g={g} x={colX(r)} y={boxY(g, r, box.k) + 10} now={now} round={r} bracketSize={B} onSelect={select} actions={actions} move={move ?? undefined} />),
          )}
        </svg>
      </div>
    </>
  );
}

/**
 * The move controls for the override tree (O-17): works out every round-one seat, and runs a mouse drag.
 * A drag starts after the pointer moves a few pixels, so a plain click still selects; touch never drags,
 * so a swipe always scrolls the tree and a phone uses click-then-click instead. Esc drops whatever is held.
 */
function useMove(b: BracketPayload, seats: SeatControls | undefined): MoveView | null {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const seatsRef = useRef(seats);
  useEffect(() => {
    seatsRef.current = seats;
  });
  const dragging = !!drag;
  const selected = seats?.selected ?? null;

  useEffect(() => {
    if (!dragging && !selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dragRef.current = null;
      setDrag(null);
      seatsRef.current?.onPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragging, selected]);

  if (!seats || !b.competition) return null;
  const open = new Set(b.competition.open_places);
  const matchById = new Map(b.rounds.flatMap((r) => r.matches).map((m) => [m.id, m]));
  const movable = (e: EntryView) =>
    (e.position.status === "waiting" && e.position.round === 1) ||
    (e.position.status === "in_match" && matchById.get(e.position.matchId)?.round === 1 && matchById.get(e.position.matchId)?.state === "not_started");
  const seat = (slot: number): SeatInfo => {
    const entry = b.entries.find((e) => e.slot === slot && e.position.status !== "out") ?? null;
    return { slot, entry, movable: !!entry && movable(entry), open: !entry && open.has(slot) };
  };
  return {
    seats,
    drag,
    picked: b.entries.find((e) => e.entry_id === seats.selected) ?? null,
    seatsOf: (k) => [seat(2 * k - 1), seat(2 * k)],
    onPointerDown: (e, entry) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      e.preventDefault(); // no text selection while dragging
      const slotUnder = (x: number, y: number): number | null => {
        const el = document.elementFromPoint(x, y)?.closest("[data-slot]");
        return el instanceof SVGElement && el.dataset.open ? Number(el.dataset.slot) : null;
      };
      dragRef.current = { entry, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, over: null };
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const active = d.active || Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 5;
        if (!active) return;
        const next = { ...d, x: ev.clientX, y: ev.clientY, active, over: slotUnder(ev.clientX, ev.clientY) };
        dragRef.current = next;
        setDrag(next);
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const d = dragRef.current;
        dragRef.current = null;
        setDrag(null);
        if (!d?.active) return; // a plain click: the seat's own onClick selects
        // The click that follows a drag must not also select or open whatever it lands on.
        window.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
        const slot = slotUnder(ev.clientX, ev.clientY);
        if (slot !== null) seatsRef.current?.onMove(d.entry, slot);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
  };
}
