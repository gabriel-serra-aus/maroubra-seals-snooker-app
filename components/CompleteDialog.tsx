"use client";

import { useState } from "react";
import type { BracketPayload, MatchView } from "@/lib/bracket/payload";
import { post } from "./client/api";
import { fmtRating } from "./client/format";
import { useAction } from "./client/hooks";

interface CompleteReply {
  loser_decision: string | null;
  no_slots: boolean;
  auto_closed: boolean;
  free_passes: number;
  round_drawn: number | null;
  completed: boolean;
}

/** Complete match / correct result (spec 3.5). */
export function CompleteDialog({ m, b, mode, onClose, onSaved }: { m: MatchView; b: BracketPayload; mode: "complete" | "correct"; onClose: () => void; onSaved: (msg: string | null) => void }) {
  const c = b.competition!;
  const [winner, setWinner] = useState<string>(mode === "correct" && m.winner_id ? m.winner_id : m.a.entry_id);
  const loser = winner === m.a.entry_id ? m.b : m.a;
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
      if (r.no_slots) notes.push(`No open slots left — ${loser.name} is out.`);
      if (r.auto_closed) notes.push(`Buy-backs closed automatically${r.free_passes ? ` · ${r.free_passes} free pass${r.free_passes > 1 ? "es" : ""}` : ""}.`);
      if (r.round_drawn) notes.push(`Round ${r.round_drawn} drawn.`);
      if (r.completed) notes.push("That was the final — the night is complete.");
      onSaved(notes.length ? notes.join(" ") : null);
    });

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === "complete" ? "Complete" : "Correct"} {m.label}</h2>
        <h3>Winner</h3>
        {[m.a, m.b].map((e) => (
          <label key={e.entry_id} className="radio">
            <input type="radio" name="winner" checked={winner === e.entry_id} onChange={() => setWinner(e.entry_id)} />
            {e.name} ({fmtRating(e.entry_id === m.a.entry_id ? m.rating_a : m.rating_b)})
          </label>
        ))}
        {m.round === 1 && (
          <>
            <h3>{loser.name} lost in round one</h3>
            {eligible ? (
              <>
                <label className="radio">
                  <input type="radio" name="decision" checked={decision === "bought_back"} disabled={slotsLeft <= 0} onChange={() => setDecision("bought_back")} />
                  Buys back {slotsLeft > 0 ? `($2, ${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left)` : `— no open slots left, ${loser.name} is out`}
                </label>
                <label className="radio">
                  <input type="radio" name="decision" checked={decision === "declined" || slotsLeft <= 0} onChange={() => setDecision("declined")} />
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
          <button className="btn primary" disabled={busy} onClick={save}>Save result</button>
          <button className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
