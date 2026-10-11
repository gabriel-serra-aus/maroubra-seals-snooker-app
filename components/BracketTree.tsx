"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BoxView, BracketPayload, EntryView, MatchView } from "@/lib/bracket/payload";
import { boxLabel, feederLabel } from "@/lib/logic/derive";
import { formatRemaining, matchClock } from "@/lib/timer";
import { AvatarSvg } from "./Avatar";
import { fmtRating } from "./client/format";
import type { MatchActions } from "./MatchCard";

// Geometry of the tree, in SVG units (O-28). A box is two player lines with a block down its right side
// carrying the match label, the table and clock, and on the admin tree the Start / Record result tap
// (spec 3.4). The drawing is scaled to the width of the screen (a phone scrolls sideways instead).
const SIDE = 70;
const BOX_W = 316;
const TEXT_W = BOX_W - SIDE;
const BOX_H = 66;
const PITCH = BOX_H + 10;
const GAP = 44;
const PAD = 8;
const HEAD = 30;

const cut = (name: string, max: number) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

/** A rectangle with only its right-hand corners rounded: the side block of a box. */
const rightRounded = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;

function Line({ e, y, x, muted, winner, loser, rating, start }: { e: EntryView; y: number; x: number; muted?: boolean; winner?: boolean; loser?: boolean; rating?: number; start?: number }) {
  // A small face before the name (O-18); the name is cut a little shorter to make room.
  return (
    <g>
      <AvatarSvg id={e.player_id} name={e.name} photo={e.photo} cx={x + 12} cy={y - 5} r={12} />
      <text x={x + 30} y={y} className={`tree-name ${muted ? "muted" : ""} ${winner ? "winner" : ""} ${loser ? "loser" : ""}`}>
        {winner ? "✔ " : ""}
        {cut(e.name, start ? 13 : 17)} <tspan className="tree-rating">({fmtRating(rating ?? e.rating)})</tspan>
        {/* The handicap start, beside the weaker player who receives it (rules §6, spec 5.6). */}
        {start ? <tspan className="tree-start"> +{start}</tspan> : null}
        {e.source === "buyback" && <tspan className="tree-tag"> bb</tspan>}
        {e.source === "late" && <tspan className="tree-tag late"> la</tspan>}
      </text>
    </g>
  );
}

/**
 * The block down the right of a box (O-28): the match label, and the table and clock while it is played.
 * On the admin tree a match that can start or be recorded makes the whole block its one-tap button
 * (spec 3.4); everywhere else the block is pale and the tap on the box opens its card.
 */
function SideBlock({ b, m, x, top, now, actions }: { b: BoxView; m: MatchView | null; x: number; top: number; now: number; actions?: MatchActions }) {
  const sx = x + TEXT_W;
  const cx = sx + SIDE / 2;
  const clock = m && m.state === "in_play" ? matchClock(m.started_at, m.time_limit_minutes, now) : null;
  const action = actions && m ? (m.state === "not_started" ? "start" : m.state === "in_play" ? "complete" : null) : null;
  const locked = action ? actions!.locked(m!) : false;
  const pending = action ? actions!.pending(action, m!) : false;
  const fire = () => {
    if (!action || locked) return;
    if (action === "start") actions!.onStart(m!);
    else actions!.onComplete(m!);
  };
  const info = (
    <>
      {action && (
        <text x={cx} y={top + 22} className="tree-btn-icon">
          {pending ? "…" : action === "start" ? "▶" : "■"}
        </text>
      )}
      <text x={cx} y={top + (action ? 40 : 38)} className="tree-label">
        {b.label}
      </text>
      {m && (clock || (m.table_number && m.state !== "finished")) && (
        <text x={cx} y={top + 58} className="tree-label">
          {m.table_number && m.state !== "finished" ? <tspan className="tree-table">T{m.table_number}</tspan> : null}
          {m.table_number && clock ? " " : null}
          {clock && <tspan className={`tree-clock ${clock.timed_out ? "timed-out" : ""}`}>{clock.timed_out ? "⚠ 0:00" : formatRemaining(clock.remaining_ms)}</tspan>}
        </text>
      )}
    </>
  );
  if (!action) {
    return (
      <g className="tree-side">
        <path d={rightRounded(sx, top, SIDE, BOX_H, 6)} />
        {info}
      </g>
    );
  }
  return (
    <g
      className={`tree-btn ${action} ${locked ? "disabled" : ""}`}
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-label={`${action === "start" ? "Start" : "Record result of"} ${m!.label}`}
      onClick={(e) => {
        // The box behind opens the full card (limit, cancel start, review); the block acts at once.
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
      <path d={rightRounded(sx, top, SIDE, BOX_H, 6)} />
      {info}
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
      <rect x={x + 6} y={top} width={TEXT_W - 10} height={26} rx={3} className="seat-bg" />
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

function Box({ b, x, top, now, round, bracketSize, onSelect, actions, move }: { b: BoxView; x: number; top: number; now: number; round: number; bracketSize: number; onSelect?: (m: MatchView) => void; actions?: MatchActions; move?: MoveView }) {
  const m = b.match;
  // From round two a box is the meeting place of two boxes below it (O-14): name them while it waits.
  const feeders = round > 1 ? [boxLabel(bracketSize, round - 1, 2 * b.k - 1), boxLabel(bracketSize, round - 1, 2 * b.k)] : null;
  // On the override screen a round-one box not yet under way is drawn seat by seat, so each player can be
  // moved and each open seat can take one (spec 5.10, O-17). Every other box draws as usual.
  const seated = move && round === 1 && !b.free_pass && (!m || m.state === "not_started") ? move.seatsOf(b.k) : null;
  const state = m ? m.state : seated ? (seated.some((x) => x.entry) ? "awaiting" : "empty") : b.entry ? (b.free_pass ? "pass" : "awaiting") : "empty";
  const select = m && onSelect ? () => onSelect(m) : undefined;
  const y1 = top + 27;
  const y2 = top + 53;
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
      {seated ? (
        <>
          <Seat seat={seated[0]} m={m} x={x} y={y1} top={top + 6} move={move!} onPointerDown={move!.onPointerDown} />
          <Seat seat={seated[1]} m={m} x={x} y={y2} top={top + 34} move={move!} onPointerDown={move!.onPointerDown} />
        </>
      ) : m ? (
        <>
          <Line e={m.a} x={x + 12} y={y1} winner={m.winner_id === m.a.entry_id} loser={m.state === "finished" && m.winner_id !== m.a.entry_id} rating={m.rating_a} start={m.start_entry_id === m.a.entry_id ? m.start_points : 0} />
          <Line e={m.b} x={x + 12} y={y2} winner={m.winner_id === m.b.entry_id} loser={m.state === "finished" && m.winner_id !== m.b.entry_id} rating={m.rating_b} start={m.start_entry_id === m.b.entry_id ? m.start_points : 0} />
        </>
      ) : b.entry ? (
        <>
          <Line e={b.entry} x={x + 12} y={y1} />
          <text x={x + 12} y={y2} className="tree-sub">
            {b.free_pass ? "free pass" : feeders && b.entry.slot !== null ? `awaiting winner of ${feederLabel(bracketSize, b.entry.slot, round)}` : "awaiting opponent"}
          </text>
        </>
      ) : feeders ? (
        <>
          <text x={x + 12} y={y1} className="tree-sub">
            winner of {feeders[0]}
          </text>
          <text x={x + 12} y={y2} className="tree-sub">
            winner of {feeders[1]}
          </text>
        </>
      ) : (
        <text x={x + 12} y={top + BOX_H / 2 + 5} className="tree-sub">
          open
        </text>
      )}
      <SideBlock b={b} m={m} x={x} top={top} now={now} actions={actions} />
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

/** Tree (two pages, round one in two columns) or Full tree (every round at once) (O-28). */
export type TreeLayout = "paged" | "full";

/** One column of the drawing: the boxes of a round it shows, and the row each sits on. */
interface Column {
  round: number;
  x: number;
  boxes: Array<{ box: BoxView; top: number }>;
}

/**
 * The whole night as a fixed tree (spec 3.4, 3.8, 5.4). Fills the width of the screen and scrolls
 * sideways on a phone. With `onSelect`, every match box is a button that opens its card (admin); with
 * `actions` as well, each box's side block is its own Start / Record result tap, so the common taps need
 * no dialog.
 *
 * `paged` (O-28) splits the night in two pages, rounds 1–3 and round 2 to the final, switched on the
 * phone with no fetch: round one in two columns beside the round-two box each pair feeds, every later box
 * level with the middle of its feeders. It opens on the second once buy-backs are closed, moves there by itself the moment
 * they close — whoever closed them — and back if the override reopens them. `full` is the paper drawing:
 * every round, each later box level with the middle of its two feeders.
 */
export function BracketTree({ b, now, onSelect, actions, seats, layout = "paged" }: { b: BracketPayload; now: number; onSelect?: (m: MatchView) => void; actions?: MatchActions; seats?: SeatControls; layout?: TreeLayout }) {
  const move = useMove(b, seats);
  const c = b.competition;
  const closed = !!c?.buybacks_closed_at;
  const [page, setPage] = useState<1 | 2>(closed ? 2 : 1);
  // The window closing (or reopening) moves the page; the viewer's own tap holds until it changes again.
  const [seenClosed, setSeenClosed] = useState(closed);
  if (closed !== seenClosed) {
    setSeenClosed(closed);
    setPage(closed ? 2 : 1);
  }
  const arrowId = useId();
  if (!c) return null;
  const R = c.rounds_total;
  const B = c.bracket_size;
  const rounds = new Map(b.rounds.map((r) => [r.round, r]));
  const boxesOf = (round: number): BoxView[] => {
    const rv = rounds.get(round);
    if (rv) return rv.boxes;
    const offset = B - B / 2 ** (round - 1);
    return Array.from({ length: B / 2 ** round }, (_, i) => ({ k: i + 1, number: offset + i + 1, label: boxLabel(B, round, i + 1), match: null, entry: null, free_pass: false }));
  };
  // While a player is picked to move, a click on a box puts them down rather than opening its card.
  const select = onSelect && seats?.selected ? () => seats.onPick(null) : onSelect;
  const rowTop = (row: number) => PAD + HEAD + (row - 1) * PITCH;
  const mid = (top: number) => top + BOX_H / 2;

  const columns: Column[] = [];
  const lines: string[] = [];
  const arrows: string[] = [];
  let rows: number;
  if (layout === "full") {
    rows = B / 2;
    for (let r = 1; r <= R; r++) {
      // Centre of box k in round r: the average of its feeders, which works out as a closed form.
      const span = PITCH * 2 ** (r - 1);
      columns.push({ round: r, x: PAD + (r - 1) * (BOX_W + GAP), boxes: boxesOf(r).map((box) => ({ box, top: PAD + HEAD + (box.k - 0.5) * span - BOX_H / 2 - 6 })) });
    }
    for (let i = 0; i + 1 < columns.length; i++) {
      const from = columns[i];
      const to = columns[i + 1];
      const xRight = from.x + BOX_W;
      const xJoin = xRight + GAP / 2;
      for (const t of to.boxes) {
        const y1 = mid(from.boxes[2 * t.box.k - 2].top);
        const y2 = mid(from.boxes[2 * t.box.k - 1].top);
        lines.push(`M${xRight},${y1} H${xJoin} V${y2} H${xRight}`);
        arrows.push(`M${xJoin},${mid(t.top)} H${to.x - 2}`);
      }
    }
  } else {
    rows = B / 4;
    const shown = page === 1 ? [1, 2, 3] : Array.from({ length: R - 1 }, (_, i) => i + 2);
    let x = PAD;
    for (const r of shown) {
      if (r === 1) {
        // Round one in two columns, a pair to a row, so each row feeds the round-two box beside it.
        const all = boxesOf(1);
        columns.push({ round: 1, x, boxes: all.filter((box) => box.k % 2 === 1).map((box) => ({ box, top: rowTop((box.k + 1) / 2) })) });
        x += BOX_W + 14;
        columns.push({ round: 1, x, boxes: all.filter((box) => box.k % 2 === 0).map((box) => ({ box, top: rowTop(box.k / 2) })) });
      } else {
        // Round two takes a row per box; each later box sits level with the middle of its two feeders.
        columns.push({ round: r, x, boxes: boxesOf(r).map((box) => ({ box, top: rowTop((box.k - 0.5) * 2 ** (r - 2) + 0.5) })) });
      }
      x += BOX_W + GAP;
    }
    for (let i = 0; i + 1 < columns.length; i++) {
      const from = columns[i];
      const to = columns[i + 1];
      if (to.round === from.round) continue; // the two halves of round one sit side by side
      const xRight = from.x + BOX_W;
      if (from.round === 1) {
        // Round one's second column ends level with the round-two box it feeds: a straight arrow.
        for (const t of to.boxes) arrows.push(`M${xRight},${mid(t.top)} H${to.x - 2}`);
        continue;
      }
      // Two feeders join halfway across the gap and an arrow runs on from the middle, as on paper.
      const xJoin = xRight + GAP / 2;
      for (const t of to.boxes) {
        const y1 = mid(from.boxes[2 * t.box.k - 2].top);
        const y2 = mid(from.boxes[2 * t.box.k - 1].top);
        lines.push(`M${xRight},${y1} H${xJoin} V${y2} H${xRight}`);
        arrows.push(`M${xJoin},${mid(t.top)} H${to.x - 2}`);
      }
    }
  }
  const last = columns[columns.length - 1];
  const width = last.x + BOX_W + PAD;
  const height = PAD + HEAD + rows * PITCH;
  // One heading per round, ruled across every column it has: round one's rule spans both its columns.
  const heads = columns
    .filter((col, i) => i === 0 || columns[i - 1].round !== col.round)
    .map((col) => ({ round: col.round, x: col.x, end: Math.max(...columns.filter((o) => o.round === col.round).map((o) => o.x)) + BOX_W }));
  return (
    <>
      {drawnBeforeFixedBracket(b) && (
        <div className="notice small">
          This night was drawn before the fixed bracket: its later rounds were paired at random, so the tree cannot match the list. The list is right.
        </div>
      )}
      {layout === "paged" && (
        <div className="toggle tree-pages" role="tablist" aria-label="Rounds shown">
          <button type="button" role="tab" aria-selected={page === 1} className={page === 1 ? "on" : ""} onClick={() => setPage(1)}>
            Rounds 1–3
          </button>
          <button type="button" role="tab" aria-selected={page === 2} className={page === 2 ? "on" : ""} onClick={() => setPage(2)}>
            Round 2 – Final
          </button>
        </div>
      )}
      <div className="tree-scroll">
        {move?.drag?.active && (
          <div className="drag-ghost" style={{ left: move.drag.x, top: move.drag.y }}>
            {move.drag.entry.name}
          </div>
        )}
        {/* The two pages are drawn at the site's own type size (a unit is 1/16 rem) and centred, never
            stretched to the screen; a phone scrolls sideways. The full tree is fitted to the width, never
            below 90% of its size. */}
        <svg
          className={`tree ${layout} ${seats ? "seating" : ""} ${move?.drag?.active ? "dragging" : ""}`}
          style={layout === "paged" ? { width: `${width / 16}rem`, minWidth: `${width / 16}rem` } : { minWidth: Math.round(width * 0.9) }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tournament bracket">
          <defs>
            <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" className="tree-arrow" />
            </marker>
          </defs>
          {heads.map((h) => (
            <g key={`h${h.round}`}>
              <text x={h.x} y={PAD + 10} className="tree-head">
                {h.round === R ? "Final" : `Round ${h.round}`}
              </text>
              <line x1={h.x} x2={h.end} y1={PAD + 18} y2={PAD + 18} className="tree-head-rule" />
            </g>
          ))}
          <path d={lines.join(" ")} className="tree-lines" />
          {arrows.map((d) => (
            <path key={d} d={d} className="tree-lines" markerEnd={`url(#${arrowId})`} />
          ))}
          {columns.map((col) =>
            col.boxes.map(({ box, top }) => (
              <Box key={`${col.round}-${box.k}`} b={box} x={col.x} top={top} now={now} round={col.round} bracketSize={B} onSelect={select} actions={actions} move={move ?? undefined} />
            )),
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
