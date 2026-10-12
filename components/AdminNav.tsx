"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";
import { Menu } from "./Menu";

const MORE: Array<[string, string]> = [
  ["/admin/setup", "Setup"],
  ["/admin/ratings", "Ratings"],
  ["/admin/settings", "Settings"],
  ["/admin/override", "Override"],
];

/** The pages along the top bar (spec 3.1): Tonight, Players and History in the open, the rest under More, Help last (3.12). */
export function AdminNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <span className="nav-links">
      <Link href="/admin" className={active("/admin") ? "on" : ""}>
        Tonight
      </Link>
      <Link href="/admin/players" className={active("/admin/players") ? "on" : ""}>
        Players
      </Link>
      <Link href="/admin/history" className={active("/admin/history") ? "on" : ""}>
        History
      </Link>
      <Menu label="More" className={MORE.some(([h]) => active(h)) ? "on" : ""}>
        {MORE.map(([href, name]) => (
          <Link key={href} href={href} role="menuitem" className={active(href) ? "on" : ""}>
            {name}
          </Link>
        ))}
        {/* Its own window, so the night stays where it was (3.12). */}
        <a href="/admin/help" target="_blank" rel="noopener" role="menuitem">
          Help ↗
        </a>
      </Menu>
    </span>
  );
}

/** Who is signed in (spec 3.1, O-8): the initial, the name, and Log out under it. */
export function UserMenu({ name }: { name: string }) {
  return (
    <Menu
      className="who"
      label={
        <>
          <span className="avatar" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="who-name">{name}</span>
        </>
      }
    >
      <LogoutButton className="menu-item" />
    </Menu>
  );
}
