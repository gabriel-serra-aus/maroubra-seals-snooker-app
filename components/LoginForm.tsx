"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Btn } from "./Btn";

/** Admin login (spec 3.1): one box for the code; the app works out who it belongs to (O-8). */
export function LoginForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setRejected(false);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setRejected(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="narrow">
      <div className="brand center">
        {/* Served as-is from public/: three fixed sizes, no image service needed (plan: cheap and self-contained). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/club-logo.png" alt="Maroubra Seals Snooker Club" className="logo-lg" />
        <h1>Maroubra Seals Snooker</h1>
        <p className="muted">Organiser login</p>
      </div>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Admin code</span>
          <input type="password" autoComplete="current-password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <Btn type="submit" className="primary wide" disabled={!code} pending={busy}>Log in</Btn>
        {rejected && <div className="error">Code not accepted. Try again.</div>}
      </form>
      <p style={{ marginTop: 24 }}>
        <Link href="/">View the public bracket ›</Link>
      </p>
    </main>
  );
}
