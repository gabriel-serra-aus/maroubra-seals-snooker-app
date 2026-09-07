"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReviewRow } from "@/lib/logic/ratings";
import { post } from "./client/api";
import { fmtDate, fmtDelta, fmtRating } from "./client/format";
import { useAction } from "./client/hooks";
import { Btn } from "./Btn";

export interface ReviewCompetition {
  id: string;
  name: string;
  completed_at: string | null;
  rating_top_count: number;
  rating_top_delta: number;
  rating_bottom_count: number;
  rating_bottom_delta: number;
}

type Values = Record<string, string>;

function Group({ rows, values, setValues, title, group, empty }: { rows: ReviewRow[]; values: Values; setValues: React.Dispatch<React.SetStateAction<Values>>; title: string; group: ReviewRow["group"]; empty: string }) {
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
                <td>{r.name}</td>
                <td className="muted small">{r.finish}</td>
                <td className="num">
                  {fmtRating(r.current_rating)} →{" "}
                  <input className="inline" type="number" value={values[r.player_id]} onChange={(e) => setValues((v) => ({ ...v, [r.player_id]: e.target.value }))} />
                </td>
                <td className="num muted small">{r.delta !== 0 ? fmtDelta(r.delta) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** End-of-night rating review (spec 3.7, O-1). The app proposes; the organiser has final say. */
export function RatingReview({ competition, rows, others, signedInAs }: { competition: ReviewCompetition; rows: ReviewRow[]; others: Array<{ id: string; name: string }>; signedInAs: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(Object.fromEntries(rows.map((r) => [r.player_id, String(r.proposed_rating)])));
  const [saved, setSaved] = useState<number | null>(null);
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
      setSaved(r.written);
      // The review is the last step of the night: what was saved is shown against this night in the
      // history, so that is where the organiser goes next (spec 3.7, 3.11).
      router.push(`/admin/history?night=${c.id}`);
    });
  const groupProps = { rows, values, setValues };
  return (
    <main className="medium">
      <h1>Ratings · {c.name}</h1>
      <p className="muted small">
        Completed {fmtDate(c.completed_at)} · Scale: top {c.rating_top_count} {fmtDelta(c.rating_top_delta)} · bottom {c.rating_bottom_count} {fmtDelta(c.rating_bottom_delta)}
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
      <Group {...groupProps} title="Top finishers" group="top" empty="Nobody in the top group." />
      <Group {...groupProps} title="Bottom finishers" group="bottom" empty="Nobody in the bottom group." />
      <Group {...groupProps} title="Everyone else — unchanged unless you edit" group="none" empty="Nobody else took part." />
      <p className="muted small">Changed by {signedInAs} (signed in). Only players whose number differs from their current rating are written.</p>
      {error && <div className="error">{error}</div>}
      {saved !== null && <div className="info">Saved {saved} rating change{saved === 1 ? "" : "s"}. Opening the history…</div>}
      <Btn className="primary wide" disabled={busy} pending={busy} onClick={save}>Save rating changes</Btn>
      <p className="muted small">Saving finishes the night and opens its page in the history.</p>
      <div className="footer-links" style={{ marginTop: 16 }}>
        <Link href="/admin/setup">Set up the next competition ›</Link>
        <Link href="/admin/history">History of past nights ›</Link>
      </div>
    </main>
  );
}
