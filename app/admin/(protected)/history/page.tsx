import Link from "next/link";
import { BracketTree } from "@/components/BracketTree";
import { fmtDate, fmtDateShort, fmtDelta, fmtRating } from "@/components/client/format";
import { buildBracketPayload } from "@/lib/bracket/payload";
import { getDb } from "@/lib/db/client";
import { competitionHistory, type CompetitionHistory, type NightRatingChange, type NightSummary } from "@/lib/db/history";
import { getCompetition, loadSnapshot } from "@/lib/db/snapshot";

export const dynamic = "force-dynamic";

type Tab = "comps" | "handicaps";
type Cell = { change: NightRatingChange | null; played: boolean };

const dateOf = (n: NightSummary) => n.completed_at ?? n.abandoned_at ?? n.created_at;

/**
 * History (spec 3.11), two tabs. Comp history: one past night at a time — its bracket as the tree and the
 * handicap results saved against it. Handicap history: every player's rating night by night. Read-only;
 * nothing here writes.
 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; night?: string }> }) {
  const params = await searchParams;
  const tab: Tab = params.tab === "handicaps" ? "handicaps" : "comps";
  const db = await getDb();
  const history = await competitionHistory(db);
  const { nights } = history;

  return (
    <main>
      <div className="row between">
        <h1>History</h1>
        <div className="toggle" role="tablist" aria-label="History">
          <Link href="/admin/history" role="tab" aria-selected={tab === "comps"} className={tab === "comps" ? "on" : ""}>
            Comp history
          </Link>
          <Link href="/admin/history?tab=handicaps" role="tab" aria-selected={tab === "handicaps"} className={tab === "handicaps" ? "on" : ""}>
            Handicap history
          </Link>
        </div>
      </div>
      {nights.length === 0 ? (
        <p className="muted">No past competitions yet. A night appears here once it is complete or abandoned.</p>
      ) : tab === "comps" ? (
        <CompHistory history={history} nightId={params.night} />
      ) : (
        <HandicapHistory history={history} />
      )}
      <div className="footer-links">
        <Link href="/admin">Bracket ›</Link>
        <Link href="/admin/ratings">Ratings ›</Link>
        <Link href="/admin/players">Players &amp; ratings ›</Link>
      </div>
    </main>
  );
}

/** Comp history: pick a night, see its tree and the handicap results saved for it. */
async function CompHistory({ history, nightId }: { history: CompetitionHistory; nightId?: string }) {
  const { nights, changes } = history;
  const night = nights.find((n) => n.id === nightId) ?? nights[0];
  const db = await getDb();
  const row = await getCompetition(db, night.id);
  const payload = row ? buildBracketPayload(await loadSnapshot(db, row)) : null;
  const nightChanges = changes.filter((c) => c.competition_id === night.id);
  return (
    <>
      <div className="scroll-x">
        <nav className="row" aria-label="Past nights" style={{ flexWrap: "nowrap" }}>
          {nights.map((n) => (
            <Link key={n.id} href={`/admin/history?night=${n.id}`} className={`btn sm ${n.id === night.id ? "primary" : ""}`} aria-current={n.id === night.id ? "page" : undefined}>
              {fmtDateShort(dateOf(n).toISOString())}
              {n.status === "abandoned" && " (abandoned)"}
              {n.status === "complete" && !n.winner_name && " (unfinished)"}
            </Link>
          ))}
        </nav>
      </div>
      <section>
        <h2>{night.name}</h2>
        <div className="muted small">
          {fmtDate(dateOf(night).toISOString())} · {night.bracket_size} bracket · {night.players} player{night.players === 1 ? "" : "s"}
          {night.status === "abandoned" ? (
            <> · abandoned</>
          ) : (
            <>
              {" "}
              {night.winner_name ? (
                <>
                  · winner <strong>{night.winner_name}</strong>
                  {night.runner_up_name && <> · runner-up {night.runner_up_name}</>}
                </>
              ) : (
                // Ended early on time (spec 5.11): played and counted, but no final and no champion.
                <>· <strong>ended early</strong>, no winner</>
              )}
              {" "}
              · <Link href={`/admin/ratings?competition=${night.id}`}>Rating review ›</Link>
            </>
          )}
        </div>
        {payload?.competition ? (
          <BracketTree b={payload} now={Date.parse(payload.server_now)} />
        ) : (
          <p className="muted small">This night was abandoned before it finished, so there is no bracket to show.</p>
        )}
      </section>
      <section>
        <h2>Handicap results</h2>
        {night.status === "abandoned" ? (
          <p className="muted small">An abandoned night has no rating review.</p>
        ) : (
          <>
            <p className="muted small">The rating changes saved against this night in its rating review (rules §13), in the order they were saved.</p>
            <NightChanges changes={nightChanges} />
          </>
        )}
      </section>
    </>
  );
}

/** Handicap history: every player who took part in a completed night against every completed night. */
function HandicapHistory({ history }: { history: CompetitionHistory }) {
  const { nights, changes, played } = history;
  const complete = nights.filter((n) => n.status === "complete");
  // Columns: complete nights oldest to newest, so the eye reads a row left to right as time passes.
  const columns = complete.slice().reverse();
  const changeAt = new Map(changes.map((c) => [`${c.competition_id}:${c.player_id}`, c]));
  const playedAt = new Set(played.map((p) => `${p.competition_id}:${p.player_id}`));
  const completeIds = new Set(complete.map((n) => n.id));
  // Rows: everyone who took part in a complete night, by name, with their rating as it stands now.
  const players = new Map<string, { name: string; rating: number }>();
  for (const p of played) if (completeIds.has(p.competition_id) && !players.has(p.player_id)) players.set(p.player_id, { name: p.name, rating: p.rating });
  const rows = [...players].sort((a, b) => a[1].name.localeCompare(b[1].name));
  const cell = (nightId: string, playerId: string): Cell => ({ change: changeAt.get(`${nightId}:${playerId}`) ?? null, played: playedAt.has(`${nightId}:${playerId}`) });

  return (
    <section>
      <h2>Handicaps by night</h2>
      <p className="muted small">
        Each column is one completed night and shows the rating a player left with after the rating review. Red went up (a weaker handicap),
        green went down. A dash means they played and their number did not change. The last column is the rating today. Tap a date for that
        night&apos;s comp history.
      </p>
      {columns.length === 0 ? (
        <p className="muted">No completed nights yet.</p>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                {columns.map((n) => (
                  <th key={n.id} className="num" title={n.name}>
                    <Link href={`/admin/history?night=${n.id}`}>{fmtDateShort(dateOf(n).toISOString())}</Link>
                  </th>
                ))}
                <th className="num">Now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([id, p]) => (
                <tr key={id}>
                  <td>{p.name}</td>
                  {columns.map((n) => {
                    const c = cell(n.id, id);
                    if (c.change) {
                      const d = c.change.old_rating === null ? 0 : c.change.new_rating - c.change.old_rating;
                      return (
                        <td key={n.id} className={`num ${d > 0 ? "up" : d < 0 ? "down" : ""}`} title={`${fmtRating(c.change.old_rating ?? c.change.new_rating)} → ${fmtRating(c.change.new_rating)} by ${c.change.changed_by}`}>
                          {fmtRating(c.change.new_rating)} <span className="small">{d !== 0 ? fmtDelta(d) : ""}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={n.id} className="num muted">
                        {c.played ? "–" : ""}
                      </td>
                    );
                  })}
                  <td className="num">
                    <strong>{fmtRating(p.rating)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The rating changes written against one night, in the order they were saved. */
function NightChanges({ changes }: { changes: NightRatingChange[] }) {
  if (changes.length === 0) return <p className="muted small">No rating changes were saved for this night.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th className="num">Was</th>
          <th className="num">Now</th>
          <th className="num">Change</th>
          <th>By</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c, i) => {
          const d = c.old_rating === null ? 0 : c.new_rating - c.old_rating;
          return (
            <tr key={`${c.player_id}-${i}`}>
              <td>{c.name}</td>
              <td className="num muted">{c.old_rating === null ? "—" : fmtRating(c.old_rating)}</td>
              <td className="num">{fmtRating(c.new_rating)}</td>
              <td className={`num ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{fmtDelta(d)}</td>
              <td className="muted small">{c.changed_by}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
