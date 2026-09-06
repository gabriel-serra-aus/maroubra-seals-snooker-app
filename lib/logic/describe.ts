// Plain-English list of what changed between two snapshots: the confirmation text for override dry runs
// (spec 7.6) and the audit detail for logs.

import { matchLabel } from "./derive";
import type { Snapshot } from "./types";

export function describeChanges(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  const nameIn = (s: Snapshot, entryId: string | null) => {
    if (!entryId) return "?";
    const e = s.entries.find((x) => x.id === entryId);
    const p = e && s.players.find((x) => x.id === e.player_id);
    return p ? (e!.source === "buyback" ? `${p.name} (buy-back)` : p.name) : "?";
  };
  const b = before.competition;
  const a = after.competition;
  if (a.bracket_size !== b.bracket_size) out.push(`Bracket grown ${b.bracket_size} → ${a.bracket_size}`);
  if (!!a.buybacks_closed_at !== !!b.buybacks_closed_at) out.push(a.buybacks_closed_at ? "Buy-backs closed" : "Buy-backs reopened");
  if (a.status !== b.status) out.push(`Competition ${b.status} → ${a.status}`);
  if (a.winner_entry_id !== b.winner_entry_id) {
    out.push(a.winner_entry_id ? `Winner: ${nameIn(after, a.winner_entry_id)}` : "Winner cleared");
  }
  for (const m of before.matches) {
    const nm = after.matches.find((x) => x.id === m.id);
    if (!nm) {
      out.push(`${matchLabel(m)} (${nameIn(before, m.player_a_id)} v ${nameIn(before, m.player_b_id)}) removed`);
      continue;
    }
    if (nm.player_a_id !== m.player_a_id || nm.player_b_id !== m.player_b_id) {
      out.push(`${matchLabel(m)} is now ${nameIn(after, nm.player_a_id)} v ${nameIn(after, nm.player_b_id)}`);
    }
    if (nm.state !== m.state) {
      if (nm.state === "not_started") out.push(`${matchLabel(m)} reset to not started`);
      else if (nm.state === "finished") out.push(`${matchLabel(m)} finished — ${nameIn(after, nm.winner_id)} wins`);
      else out.push(`${matchLabel(m)} ${nm.state.replace("_", " ")}`);
    } else if (nm.winner_id !== m.winner_id && nm.winner_id) {
      out.push(`${matchLabel(m)} winner is now ${nameIn(after, nm.winner_id)}`);
    }
  }
  for (const m of after.matches) {
    if (!before.matches.some((x) => x.id === m.id)) {
      out.push(`${matchLabel(m)} created (round ${m.round}): ${nameIn(after, m.player_a_id)} v ${nameIn(after, m.player_b_id)}`);
    }
  }
  for (const e of before.entries) {
    const ne = after.entries.find((x) => x.id === e.id);
    if (!ne) out.push(`${nameIn(before, e.id)} removed from the night`);
    else if (ne.slot !== e.slot && ne.slot !== null) out.push(`${nameIn(after, e.id)} placed in slot ${ne.slot}`);
  }
  for (const e of after.entries) {
    if (!before.entries.some((x) => x.id === e.id)) {
      out.push(`${nameIn(after, e.id)} added to the night${e.joined_round > 1 ? ` in round ${e.joined_round}` : ""}${e.slot ? `, slot ${e.slot}` : ""}`);
    }
  }
  for (const fp of before.freePasses) {
    if (!after.freePasses.some((x) => x.id === fp.id)) out.push(`Free pass revoked: ${nameIn(before, fp.entry_id)} (round ${fp.from_round})`);
  }
  for (const fp of after.freePasses) {
    if (!before.freePasses.some((x) => x.id === fp.id)) out.push(`Free pass: ${nameIn(after, fp.entry_id)} goes through to round ${fp.from_round + 1}`);
  }
  return out;
}
