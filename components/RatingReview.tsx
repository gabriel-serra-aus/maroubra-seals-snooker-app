"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReviewCompetition } from "@/lib/db/review";
import type { ReviewRow } from "@/lib/logic/ratings";
import { post } from "./client/api";
import { fmtDate, fmtDelta, fmtRating } from "./client/format";
import { useAction } from "./client/hooks";
import { Btn } from "./Btn";

type Values = Record<string, string>;

function Group({ rows, values, setValues, saved, title, group, empty }: { rows: ReviewRow[]; values: Values; setValues: React.Dispatch<React.SetStateAction<Values>>; saved: boolean; title: string; group: ReviewRow["group"]; empty: string }) {
  const list = rows.filter((r) => r.group === group);
  return (
    <section>
      <h2>{title}</h2>
      {list.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <table>
          <tbody>
            {list.map((r) => (
              <tr key={r.player_id}>
                <td className="num muted">{rows.indexOf(r) + 1}</td>
                <td>
                  {r.name} {r.bought_back && <span className="tag buyback">bought back</span>}
                  <div className="muted small">{r.story}</div>
                  {r.tonight_change && (
                    <div className="muted small">
                      Rated {fmtRating(r.tonight_change.from)} → {fmtRating(r.tonight_change.to)} during the night
                    </div>
                  )}
                </td>
                {saved ? (
                  // Saved once (O-27): what the review wrote, read-only.
                  r.saved_change ? (
                    <>
                      <td className="num">{fmtRating(r.saved_change.from)} → {fmtRating(r.saved_change.to)}</td>
                      <td className="num muted small">{fmtDelta(r.saved_change.to - r.saved_change.from)}</td>
                    </>
                  ) : (
                    <>
                      <td className="num muted">unchanged</td>
                      <td />
                    </>
                  )
                ) : (
                  <>
                    <td className="num">
                      {fmtRating(r.current_rating)} →{" "}
                      <input className="inline" type="number" value={values[r.player_id]} onChange={(e) => setValues((v) => ({ ...v, [r.player_id]: e.target.value }))} />
                    </td>
                    <td className="num muted small">{r.delta !== 0 ? fmtDelta(r.delta) : ""}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** End-of-night rating review (spec 3.7, O-24). The app proposes; the organiser has final say. */
export function RatingReview({ competition, rows, others, signedInAs }: { competition: ReviewCompetition; rows: ReviewRow[]; others: Array<{ id: string; name: string }>; signedInAs: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(Object.fromEntries(rows.map((r) => [r.player_id, String(r.proposed_rating)])));
  const [written, setWritten] = useState<number | null>(null);
  const { busy, error, run } = useAction();
  const c = competition;
  const save = () =>
    run(async () => {
      const changes = rows.map((r) => {
        const v = Number(values[r.player_id]);
        if (!Number.isInteger(v)) throw new Error(`${r.name}: rating must be a whole number`);
        return { player_id: r.player_id, new_rating: v };
      });
      const r = await post<{ written: number }>(`/api/admin/competitions/${c.id}/rating-review`, { changes });
      setWritten(r.written);
      // The review is the last step of the night: what was saved is shown against this night in the
      // history, so that is where the organiser goes next (spec 3.7, 3.11).
      router.push(`/admin/history?night=${c.id}`);
    });
  const saved = c.rating_review_saved_at !== null;
  const groupProps = { rows, values, setValues, saved };
  // Nights reviewed under O-1 keep its groups; every night since uses O-24 (spec 5.9).
  const finish = c.rating_scheme === "finish";
  return (
    <main className="medium">
      <h1>Ratings · {c.name}</h1>
      <p className="muted small">
        Completed {fmtDate(c.completed_at)} ·{" "}
        {finish
          ? `Scale: final ${fmtDelta(c.rating_final_delta)} · semi-final ${fmtDelta(c.rating_semi_delta)} · bought back, lost again ${fmtDelta(c.rating_buyback_lost_delta)} · everyone else ${fmtDelta(c.rating_other_delta)}`
          : `Scale (O-1): top ${c.rating_top_count} ${fmtDelta(c.rating_top_delta)} · bottom ${c.rating_bottom_count} ${fmtDelta(c.rating_bottom_delta)}`}
      </p>
      {others.length > 0 && (
        <p className="small">
          Other nights:{" "}
          {others.map((o) => (
            <Link key={o.id} href={`/admin/ratings?competition=${o.id}`} style={{ marginRight: 8 }}>
              {o.name}
            </Link>
          ))}
        </p>
      )}
      {finish ? (
        <>
          {/* The O-24 groups, in this order (spec 3.7). */}
          <Group {...groupProps} title={`Reached the final (${fmtDelta(c.rating_final_delta)})`} group="final" empty="Nobody reached the final." />
          <Group {...groupProps} title={`Semi-final (${fmtDelta(c.rating_semi_delta)})`} group="semi" empty="Nobody in the semi-finals." />
          <Group {...groupProps} title={`Bought back, lost again (${fmtDelta(c.rating_buyback_lost_delta)})`} group="buyback_lost" empty="Nobody lost twice in round one." />
          <Group {...groupProps} title={`Everyone else (${fmtDelta(c.rating_other_delta)})`} group="other" empty="Nobody else took part." />
        </>
      ) : (
        <>
          <Group {...groupProps} title="Top finishers" group="top" empty="Nobody in the top group." />
          <Group {...groupProps} title="Bottom finishers" group="bottom" empty="Nobody in the bottom group." />
          <Group {...groupProps} title="Everyone else — unchanged unless you edit" group="none" empty="Nobody else took part." />
        </>
      )}
      {saved ? (
        <p className="small">
          Saved by <strong>{c.rating_review_saved_by ?? "an organiser"}</strong> on {fmtDate(c.rating_review_saved_at)}. A review is saved once; change a handicap on{" "}
          <Link href="/admin/players">Players</Link> from now on.
        </p>
      ) : (
        <>
          <p className="muted small">Changed by {signedInAs} (signed in). Only players whose number differs from their current rating are written. The review saves once: after that, handicaps change only on Players.</p>
          {error && <div className="error">{error}</div>}
          {written !== null && <div className="info">Saved {written} rating change{written === 1 ? "" : "s"}. Opening the history…</div>}
          <Btn className="primary wide" disabled={busy || written !== null} pending={busy} onClick={save}>Save rating changes</Btn>
          <p className="muted small">Saving finishes the night and opens its page in the history.</p>
        </>
      )}
      <div className="footer-links" style={{ marginTop: 16 }}>
        <Link href="/admin/setup">Set up the next competition ›</Link>
        <Link href="/admin/history">History of past nights ›</Link>
      </div>
    </main>
  );
}
