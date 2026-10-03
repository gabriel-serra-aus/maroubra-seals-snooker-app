"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Btn } from "./Btn";
import { CameraCapture } from "./CameraCapture";
import { ApiError, del, get, patch, post, put } from "./client/api";
import { fmtDate, fmtRating } from "./client/format";
import { useAction } from "./client/hooks";
import { publicNames } from "@/lib/names";

export interface ClubPlayer {
  id: string;
  name: string;
  rating: number;
  active: boolean;
  photo: string | null;
  /** Contact details, organiser's screens only (O-23). */
  phone?: string | null;
  email?: string | null;
  /** When the player last changed: an edit made from an older copy is refused (spec 7.8, O-22). */
  updated_at?: string;
}

interface HistoryRow {
  id: string;
  old_rating: number | null;
  new_rating: number;
  changed_by: string;
  reason: string | null;
  changed_at: string;
}

/** Players and ratings (spec 3.2). Never deletes (O-9). */
export function PlayersAdmin({ initial, signedInAs }: { initial: ClubPlayer[]; signedInAs: string }) {
  const [players, setPlayers] = useState(initial);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ClubPlayer | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const reload = async () => setPlayers((await get<{ players: ClubPlayer[] }>("/api/admin/players?include_inactive=1")).players);
  const shown = players.filter((p) => (showInactive || p.active) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const active = shown.filter((p) => p.active);
  const inactive = shown.filter((p) => !p.active);
  // The public site shows "First L." (O-21); names still alike at three letters need the organiser.
  const { names: publicName, clashes } = publicNames(players.filter((p) => p.active));
  const Row = ({ p }: { p: ClubPlayer }) => (
    <tr>
      <td>
        <Avatar id={p.id} name={p.name} photo={p.photo} size={36} /> {p.name}
        {!p.active && <span className="muted"> (inactive)</span>}
      </td>
      <td className="num">{fmtRating(p.rating)}</td>
      <td className="num">
        <button className="btn sm" onClick={() => setEditing(p)}>Edit</button>
      </td>
    </tr>
  );
  return (
    <main className="medium">
      <h1>Players &amp; ratings</h1>
      {clashes.map((c) => (
        <div key={c.join("|")} className="notice">
          ⚠ These players read the same on the public site ({publicName.get(players.find((p) => p.name === c[0])!.id)}): {c.join(", ")}.
          Edit one of the names so they differ — for example add a nickname in brackets, &quot;John Smith (Smithy)&quot;.
        </div>
      ))}
      {notice && <div className="notice">{notice}</div>}
      <input type="search" placeholder="Search players…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row between" style={{ margin: "8px 0" }}>
        <button className="btn" onClick={() => setAdding(true)}>+ Add player</button>
        <label className="small">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th className="num">Rating</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {active.map((p) => <Row key={p.id} p={p} />)}
          {showInactive && inactive.length > 0 && (
            <tr>
              <td colSpan={3} className="muted">── Inactive ──</td>
            </tr>
          )}
          {showInactive && inactive.map((p) => <Row key={p.id} p={p} />)}
        </tbody>
      </table>
      <p className="muted small">Lower is better and ratings can go below zero. Changing a rating never changes a match already drawn tonight.</p>
      {editing && (
        <EditSheet
          p={editing}
          signedInAs={signedInAs}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); setNotice(null); await reload(); }}
          onStale={async (msg) => { setEditing(null); setNotice(msg); await reload(); }}
          onPhoto={(updated) => { setEditing(updated); setPlayers((all) => all.map((x) => (x.id === updated.id ? updated : x))); }}
        />
      )}
      {adding && <AddSheet onClose={() => setAdding(false)} onSaved={async () => { setAdding(false); await reload(); }} />}
    </main>
  );
}

/**
 * Shrinks a photo on the phone before it is sent (O-18): the centre square, 320 pixels across, as a JPEG.
 * A phone camera's 4 MB becomes about 25 KB, so the upload is quick and the database stays small.
 * Takes a chosen file or the camera's live picture (CameraCapture).
 */
async function squarePhoto(source: ImageBitmapSource): Promise<Blob> {
  const img = await createImageBitmap(source);
  const side = Math.min(img.width, img.height);
  const out = 320;
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("This browser cannot resize photos");
  g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  img.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not read that photo");
  return blob;
}

/**
 * The player's photo on the edit card: take one with the camera, choose a file, or remove it (spec 3.2,
 * O-18). Saved at once.
 */
function PhotoField({ p, onPhoto }: { p: ClubPlayer; onPhoto: (p: ClubPlayer) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const { busy, error, run, isPending } = useAction();
  const send = (photo: Blob) =>
    run(async () => {
      const r = await put<{ player: ClubPlayer }>(`/api/admin/players/${p.id}/photo`, photo);
      onPhoto(r.player);
    }, "upload");
  const upload = (file: File) =>
    run(async () => {
      const r = await put<{ player: ClubPlayer }>(`/api/admin/players/${p.id}/photo`, await squarePhoto(file));
      onPhoto(r.player);
    }, "upload");
  const remove = () =>
    run(async () => {
      const r = await del<{ player: ClubPlayer }>(`/api/admin/players/${p.id}/photo`);
      onPhoto(r.player);
    }, "remove");
  return (
    <div className="field photo-field">
      <span className="muted small">Photo</span>
      <div className="row">
        <Avatar id={p.id} name={p.name} photo={p.photo} size={94} />
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        <Btn className="sm" disabled={busy} pending={isPending("upload")} onClick={() => setCamera(true)}>
          Take photo
        </Btn>
        <Btn className="sm" disabled={busy} onClick={() => input.current?.click()}>
          Choose photo
        </Btn>
        {p.photo && (
          <Btn className="sm danger" disabled={busy} pending={isPending("remove")} onClick={remove}>
            Remove photo
          </Btn>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {camera && (
        <CameraCapture
          shrink={squarePhoto}
          onUse={(photo) => {
            setCamera(false);
            void send(photo);
          }}
          onChooseFile={() => {
            setCamera(false);
            input.current?.click();
          }}
          onClose={() => setCamera(false)}
        />
      )}
    </div>
  );
}

function EditSheet({ p, signedInAs, onClose, onSaved, onStale, onPhoto }: { p: ClubPlayer; signedInAs: string; onClose: () => void; onSaved: () => Promise<void>; onStale: (message: string) => Promise<void>; onPhoto: (p: ClubPlayer) => void }) {
  const [name, setName] = useState(p.name);
  const [rating, setRating] = useState(String(p.rating));
  const [reason, setReason] = useState("");
  const [active, setActive] = useState(p.active);
  const [phone, setPhone] = useState(p.phone ?? "");
  const [email, setEmail] = useState(p.email ?? "");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => {
    void get<{ history: HistoryRow[] }>(`/api/admin/players/${p.id}/rating-history`).then((r) => setHistory(r.history));
  }, [p.id]);
  const save = () =>
    run(async () => {
      const r = Number(rating);
      if (!Number.isInteger(r)) throw new Error("Rating must be a whole number");
      if (!name.trim()) throw new Error("Enter a name");
      try {
        await patch(`/api/admin/players/${p.id}`, { expected_updated_at: p.updated_at, name: name.trim(), rating: r, reason: reason.trim() || undefined, active, phone, email });
      } catch (e) {
        // Changed on another screen since this sheet opened (spec 7.8): show the latest instead of overwriting it.
        if (e instanceof ApiError && e.body.code === "stale") return onStale(e.message);
        throw e;
      }
      await onSaved();
    });
  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{p.name}</h2>
        <PhotoField p={p} onPhoto={onPhoto} />
        <label className="field">
          <span>Name</span>
          <input type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Rating</span>
          <input type="number" value={rating} onChange={(e) => setRating(e.target.value)} />
        </label>
        <label className="field">
          <span>Reason</span>
          <input type="text" placeholder="weekly review" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <ContactFields phone={phone} email={email} setPhone={setPhone} setEmail={setEmail} />
        <div className="field">
          <span className="muted small">Status</span>
          <label className="radio"><input type="radio" checked={active} onChange={() => setActive(true)} /> Active</label>
          <label className="radio"><input type="radio" checked={!active} onChange={() => setActive(false)} /> Inactive (hidden from tonight&apos;s list; history kept)</label>
        </div>
        <p className="muted small">Changed by {signedInAs} (signed in)</p>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <Btn className="primary" disabled={busy} pending={busy} onClick={save}>Save</Btn>
          <Btn disabled={busy} onClick={onClose}>Cancel</Btn>
        </div>
        <h3>History</h3>
        {history === null ? (
          <p className="muted">Loading…</p>
        ) : history.length === 0 ? (
          <p className="muted">No changes recorded.</p>
        ) : (
          <table>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="num">{h.old_rating === null ? "—" : fmtRating(h.old_rating)} → {fmtRating(h.new_rating)}</td>
                  <td>{fmtDate(h.changed_at)}</td>
                  <td>{h.changed_by}</td>
                  <td className="muted small">{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Mobile number and email, both optional (spec 3.2, O-23); the server checks and tidies them. */
function ContactFields({ phone, email, setPhone, setEmail }: { phone: string; email: string; setPhone: (v: string) => void; setEmail: (v: string) => void }) {
  return (
    <>
      <label className="field">
        <span>Mobile number (or landline, optional)</span>
        <input type="tel" inputMode="tel" autoComplete="off" placeholder="0412 345 678" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="field">
        <span>Email address (optional)</span>
        <input type="email" inputMode="email" autoComplete="off" placeholder="name@example.com" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
    </>
  );
}

export function AddSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (player: ClubPlayer) => Promise<void> }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      if (!name.trim()) throw new Error("Enter a name");
      if (!Number.isInteger(Number(rating)) || rating.trim() === "") throw new Error("Rating must be a whole number");
      const r = await post<{ player: ClubPlayer }>("/api/admin/players", { name: name.trim(), rating: Number(rating), phone, email });
      await onSaved(r.player);
    });
  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Add player</h2>
        <label className="field">
          <span>Name</span>
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Starting rating (lower is better; negatives allowed)</span>
          <input type="number" value={rating} onChange={(e) => setRating(e.target.value)} />
        </label>
        <ContactFields phone={phone} email={email} setPhone={setPhone} setEmail={setEmail} />
        {error && <div className="error">{error}</div>}
        <div className="row">
          <Btn className="primary" disabled={busy} pending={busy} onClick={save}>Add</Btn>
          <Btn disabled={busy} onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}
