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
            <Link href="/admin" className="logo-link" aria-label="Tonight">
              {/* Served as-is from public/: three fixed sizes, no image service needed (plan: cheap and self-contained). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/club-logo-small.png" alt="" className="logo-sm" />
              <span className="brand-name">Maroubra Seals Snooker</span>
            </Link>
            <span className="nav-links">
              <Link href="/admin"><strong>Tonight</strong></Link>
              <Link href="/admin/setup">Setup</Link>
              <Link href="/admin/players">Players</Link>
              <Link href="/admin/ratings">Ratings</Link>
              <Link href="/admin/history">History</Link>
              <Link href="/admin/settings">Settings</Link>
              <Link href="/admin/override">Override</Link>
            </span>
          </nav>
          <span className="row small who">
            <span className="avatar" aria-hidden>{session.name.slice(0, 1).toUpperCase()}</span>
            <span>{session.name}</span>
            <LogoutButton />
          </span>
        </div>
      </div>
      {children}
    </>
  );
}
