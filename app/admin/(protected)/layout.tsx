import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav, UserMenu } from "@/components/AdminNav";
import { currentSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Every admin page: a valid cookie or a redirect to login, and who is signed in at the right (spec 3.1). */
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
            <AdminNav />
          </nav>
          <UserMenu name={session.name} />
        </div>
      </div>
      {children}
    </>
  );
}
