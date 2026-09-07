import Link from "next/link";
import { RatingReview } from "@/components/RatingReview";
import { currentSession } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { listCompetitions } from "@/lib/db/competitions";
import { getCompetition, loadSnapshot } from "@/lib/db/snapshot";
import { ratingReview } from "@/lib/logic/ratings";

export const dynamic = "force-dynamic";

/** End-of-night rating review (spec 3.7). ?competition=<id>, defaulting to the most recent complete night. */
export default async function RatingsPage({ searchParams }: { searchParams: Promise<{ competition?: string }> }) {
  const { competition: id } = await searchParams;
  const db = await getDb();
  const session = await currentSession();
  const completed = (await listCompetitions(db, 20)).filter((c) => c.status === "complete");
  const c = id ? await getCompetition(db, id) : completed[0];
  if (!c || c.status !== "complete") {
    return (
      <main className="narrow">
        <h1>Ratings</h1>
        <p className="muted">The rating review opens once a competition is complete.</p>
        {completed.length > 0 && (
          <ul>
            {completed.map((x) => (
              <li key={x.id}>
                <Link href={`/admin/ratings?competition=${x.id}`}>{x.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }
  const s = await loadSnapshot(db, c);
  return (
    <RatingReview
      competition={{
        id: c.id,
        name: c.name,
        completed_at: c.completed_at ? new Date(c.completed_at).toISOString() : null,
        rating_top_count: c.rating_top_count,
        rating_top_delta: c.rating_top_delta,
        rating_bottom_count: c.rating_bottom_count,
        rating_bottom_delta: c.rating_bottom_delta,
      }}
      rows={ratingReview(s)}
      others={completed.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, name: x.name }))}
      signedInAs={session?.name ?? ""}
    />
  );
}
