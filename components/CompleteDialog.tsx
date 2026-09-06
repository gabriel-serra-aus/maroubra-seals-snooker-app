"use client";

import { useState } from "react";
import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { post } from "./client/api";
import { describeWinnerTo, fmtRating, type WinnerTo } from "./client/format";
import { useAction } from "./client/hooks";

interface CompleteReply {
  loser_decision: string | null;
  no_slots: boolean;
  buyback_match_number: number | null;
  auto_closed: boolean;
  free_passes: number;
  winner_to: WinnerTo;
  completed: boolean;
  bracket: BracketPayload;
}

/** Complete match / correct result (spec 3.5). */
export function CompleteDialog({ m, b, mode, onClose, onSaved }: { m: MatchView; b: BracketPayload; mode: "complete" | "correct"; onClose: () => void; onSaved: (msg: string | null, bracket: BracketPayload) => void }) {
  const c = b.competition!;
  const [winner, setWinner] = useState<string>(mode === "correct" && m.winner_id ? m.winner_id : m.a.entry_id);
  const loser = winner === m.a.entry_id ? m.b : m.a;
  const winnerView = winner === m.a.entry_id ? m.a : m.b;
  const eligible = m.round === 1 && loser.source === "draw" && c.buybacks_open && (!loser.has_buyback_entry || (mode === "correct" && loser.buyback_decision === "bought_back"));
  const initialDecision = mode === "correct" && loser.buyback_decision === "bought_back" ? "bought_back" : c.open_slots > 0 ? "bought_back" : "declined";
  const [decision, setDecision] = useState<"bought_back" | "declined">(initialDecision);
  const { busy, error, run } = useAction();
  const slotsLeft = c.open_slots + (mode === "correct" && loser.buyback_decision === "bought_back" ? 1 : 0);

  const save = () =>
    run(async () => {
      const r = await post<CompleteReply>(`/api/admin/matches/${m.id}/${mode}`, {
        winner_entry_id: winner,
        loser_decision: eligible ? decision : undefined,
      });
      const notes: string[] = [];
      const to = describeWinnerTo(winnerView.name, r.winner_to);
      if (to) notes.push(to);
      if (r.buyback_match_number) notes.push(`${loser.name} buys back into M${r.buyback_match_number}.`);
      else if (r.loser_decision === "bought_back") notes.push(`${loser.name} buys back and awaits an opponent.`);
      if (r.no_slots) notes.push(`No open slots left — ${loser.name} is out.`);
      if (r.auto_closed) notes.push(`Buy-backs closed automatically${r.free_passes ? ` · ${r.free_passes} free pass${r.free_passes > 1 ? "es" : ""}` : ""}.`);
      if (r.completed) notes.push("That was the final — the night is complete.");
      onSaved(notes.length ? notes.join(" ") : null, r.bracket);
    });

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} aria-busy={busy}>
        <h2>{mode === "complete" ? "Complete" : "Correct"} {m.label}</h2>
        <h3>Winner</h3>
        {[m.a, m.b].map((e) => (
          <label key={e.entry_id} className="radio">
            <input type="radio" name="winner" disabled={busy} checked={winner === e.entry_id} onChange={() => setWinner(e.entry_id)} />
            {e.name} ({fmtRating(e.entry_id === m.a.entry_id ? m.rating_a : m.rating_b)})
          </label>
        ))}
        {m.round === 1 && (
          <>
            <h3>{loser.name} lost in round one</h3>
            {eligible ? (
              <>
                <label className="radio">
                  <input type="radio" name="decision" checked={decision === "bought_back"} disabled={busy || slotsLeft <= 0} onChange={() => setDecision("bought_back")} />
                  Buys back {slotsLeft > 0 ? `($2, ${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left)` : `— no open slots left, ${loser.name} is out`}
                </label>
                <label className="radio">
                  <input type="radio" name="decision" disabled={busy} checked={decision === "declined" || slotsLeft <= 0} onChange={() => setDecision("declined")} />
                  Declines
                </label>
              </>
            ) : (
              <p className="muted">
                {!c.buybacks_open ? `Buy-backs are closed. ${loser.name} is out.` : loser.source === "buyback" ? `${loser.name} has used their buy-back and is out.` : `${loser.name} has already bought back tonight and is out.`}
              </p>
            )}
          </>
        )}
        {error && <div className="error">{error}</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save result"}</button>
          <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
