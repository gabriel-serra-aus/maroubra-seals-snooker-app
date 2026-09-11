"use client";

import { useState } from "react";
import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { numberLabel } from "@/lib/logic/derive";
import { Btn } from "./Btn";
import { describeWinnerTo, fmtRating, type WinnerTo } from "./client/format";

export interface CompleteReply {
  loser_decision: string | null;
  no_slots: boolean;
  buyback_match_number: number | null;
  winner_to: WinnerTo;
  completed: boolean;
  bracket: BracketPayload;
}

export interface CompleteRequest {
  winner_entry_id: string;
  loser_decision?: "bought_back" | "declined";
}

type Decision = "bought_back" | "declined";

/**
 * Complete match / review result (spec 3.5): a dialog centred on the screen.
 *
 * Nothing is chosen for the organiser: Complete opens with no winner and no buy-back decision, and Save
 * only lights up once both are tapped, with a one-line summary of what it will do above it. Review keeps
 * the current result pre-selected, since the point is to change it. Saving hands the request to the
 * screen (`onSubmit`) and closes at once, so the card shows the spinner and the next table can be served.
 */
export function CompleteDialog({
  m,
  b,
  mode,
  onClose,
  onSubmit,
}: {
  m: MatchView;
  b: BracketPayload;
  mode: "complete" | "correct";
  onClose: () => void;
  onSubmit: (body: CompleteRequest, describe: (r: CompleteReply) => string | null) => void;
}) {
  const c = b.competition!;
  const [winner, setWinner] = useState<string | null>(mode === "correct" ? m.winner_id : null);
  const loser = winner === null ? null : winner === m.a.entry_id ? m.b : m.a;
  const winnerView = winner === m.a.entry_id ? m.a : winner === m.b.entry_id ? m.b : null;
  // Whether the loser gets the buy-back question at all (§3, O-3): round one, not already a buy-back,
  // window open, and no buy-back entry yet (or the one this review is about to move).
  const eligible = (l: typeof m.a) => m.round === 1 && l.source !== "buyback" && c.buybacks_open && (!l.has_buyback_entry || (mode === "correct" && l.buyback_decision === "bought_back"));
  const [decision, setDecision] = useState<Decision | null>(mode === "correct" && m.winner_id ? (loser?.buyback_decision === "bought_back" ? "bought_back" : loser?.buyback_decision === "declined" ? "declined" : null) : null);
  const slotsLeft = c.open_slots + (mode === "correct" && loser?.buyback_decision === "bought_back" ? 1 : 0);
  const askDecision = loser !== null && eligible(loser);
  // A buy-back needs a slot; with none left the loser is out whatever they want (O-3).
  const canBuyBack = slotsLeft > 0;
  const ready = winner !== null && (!askDecision || decision !== null);

  const pickWinner = (id: string) => {
    setWinner(id);
    // The loser changed, so their decision is theirs to make again.
    if (id !== winner) setDecision(null);
  };

  const save = () => {
    if (!ready || !winnerView || !loser) return;
    const w = winnerView;
    const l = loser;
    const chosen = askDecision ? (decision as Decision) : undefined;
    onSubmit({ winner_entry_id: w.entry_id, loser_decision: chosen }, (r) => {
      const notes: string[] = [];
      const to = describeWinnerTo(w.name, r.winner_to, c.bracket_size);
      if (to) notes.push(to);
      if (r.buyback_match_number) notes.push(`${l.name} buys back into ${numberLabel(c.bracket_size, r.buyback_match_number)}.`);
      else if (r.loser_decision === "bought_back") notes.push(`${l.name} buys back and awaits an opponent.`);
      if (r.no_slots) notes.push(`No open slots left — ${l.name} is out.`);
      if (r.completed) notes.push("That was the final — the night is complete.");
      return notes.length ? notes.join(" ") : null;
    });
  };

  const summary = (() => {
    if (!winnerView || !loser) return null;
    const parts = [`${winnerView.name} wins ${m.label}.`];
    if (askDecision) {
      if (decision === "bought_back") parts.push(canBuyBack ? `${loser.name} buys back ($2).` : `${loser.name} is out — no open slots.`);
      else if (decision === "declined") parts.push(`${loser.name} declines and is out.`);
    } else if (m.round === 1) {
      parts.push(`${loser.name} is out.`);
    }
    return parts.join(" ");
  })();

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet result" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row between">
          <h2>{mode === "complete" ? "Record result" : "Review result"}</h2>
          <span className="muted">{m.label}</span>
        </div>
        <h3>Who won?</h3>
        <div className="choices" role="radiogroup" aria-label="Winner">
          {[m.a, m.b].map((e) => (
            <label key={e.entry_id} className={`choice ${winner === e.entry_id ? "on" : ""}`}>
              <input type="radio" name="winner" checked={winner === e.entry_id} onChange={() => pickWinner(e.entry_id)} />
              <span className="choice-label">
                {e.name} <span className="muted">({fmtRating(e.entry_id === m.a.entry_id ? m.rating_a : m.rating_b)})</span>
              </span>
            </label>
          ))}
        </div>
        {m.round === 1 && loser && (
          <>
            <h3>Buy-back decision</h3>
            {askDecision ? (
              <div className="choices" role="radiogroup" aria-label="Buy-back decision">
                <label className={`choice ${decision === "bought_back" ? "on" : ""} ${canBuyBack ? "" : "off"}`}>
                  <input type="radio" name="decision" checked={decision === "bought_back"} disabled={!canBuyBack} onChange={() => setDecision("bought_back")} />
                  <span className="choice-label">
                    {loser.name} buys back · $2
                    <span className="muted small"> {canBuyBack ? `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left` : "no open slots left"}</span>
                  </span>
                </label>
                <label className={`choice ${decision === "declined" ? "on" : ""}`}>
                  <input type="radio" name="decision" checked={decision === "declined"} onChange={() => setDecision("declined")} />
                  <span className="choice-label">{loser.name} declines</span>
                </label>
              </div>
            ) : (
              <p className="muted">
                {!c.buybacks_open ? `Buy-backs are closed. ${loser.name} is out.` : loser.source === "buyback" ? `${loser.name} has used their buy-back and is out.` : `${loser.name} has already bought back tonight and is out.`}
              </p>
            )}
          </>
        )}
        {m.round === 1 && !loser && <p className="muted small">Pick the winner first; the loser&apos;s buy-back comes next.</p>}
        <div className={`summary ${summary ? "" : "empty"}`} aria-live="polite">
          {summary ?? (winner === null ? "Choose the winner to see what will be saved." : "Choose the loser's buy-back decision.")}
        </div>
        <div className="row dialog-actions">
          <Btn className="primary" disabled={!ready} onClick={save}>
            Save result
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}
