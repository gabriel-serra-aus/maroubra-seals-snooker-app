import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { currentSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Every admin page: a valid cookie or a redirect to login, and "Signed in as" in the header (spec 3.1). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/admin/login");
  return (
    <>
      <div className="topbar">
        <div className="inner">
          <nav>
            <Link href="/admin" className="logo-link" aria-label="Bracket">
              {/* Served as-is from public/: three fixed sizes, no image service needed (plan: cheap and self-contained). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/club-logo-small.png" alt="" className="logo-sm" />
            </Link>
            <Link href="/admin"><strong>Bracket</strong></Link>
            <Link href="/admin/setup">Setup</Link>
            <Link href="/admin/players">Players</Link>
            <Link href="/admin/ratings">Ratings</Link>
            <Link href="/admin/override">Override</Link>
          </nav>
          <span className="row small">
            <span className="muted">Signed in as <strong>{session.name}</strong></span>
            <LogoutButton />
          </span>
        </div>
      </div>
      {children}
    </>
  );
}
