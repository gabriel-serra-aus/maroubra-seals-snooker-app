// Force Pair (rules 10, spec 5.5): round one only, two waiting players at random, never touches a match.

import { conflict } from "./errors";
import { currentRound, waitingEntries } from "./derive";
import { pairInRoundOne } from "./matches";
import { shuffle } from "./random";
import type { Ctx, MatchRow, Snapshot } from "./types";

export function forcePair(s: Snapshot, ctx: Ctx): MatchRow {
  if (s.competition.status !== "in_progress" || currentRound(s) !== 1) {
    throw conflict("Force Pair is only available in round one");
  }
  const waiting = waitingEntries(s, 1);
  if (waiting.length < 2) throw conflict("Needs 2 waiting players");
  const [a, b] = shuffle(waiting, ctx.rng);
  return pairInRoundOne(s, ctx, a.id, b.id, "force_pair");
}
