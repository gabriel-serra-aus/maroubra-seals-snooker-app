"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Btn } from "./Btn";
import { del, get, patch, post, put } from "./client/api";
import { fmtDate, fmtRating } from "./client/format";
import { useAction } from "./client/hooks";

export interface ClubPlayer {
  id: string;
  name: string;
  rating: number;
  active: boolean;
  photo: string | null;
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
  const reload = async () => setPlayers((await get<{ players: ClubPlayer[] }>("/api/admin/players?include_inactive=1")).players);
  const shown = players.filter((p) => (showInactive || p.active) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const active = shown.filter((p) => p.active);
  const inactive = shown.filter((p) => !p.active);
  const Row = ({ p }: { p: ClubPlayer }) => (
    <tr>
      <td>
        <Avatar name={p.name} photo={p.photo} size={36} /> {p.name}
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
          onSaved={async () => { setEditing(null); await reload(); }}
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
 */
async function squarePhoto(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
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

/** The player's photo on the edit card: take or choose one, or remove it (spec 3.2, O-18). Saved at once. */
function PhotoField({ p, onPhoto }: { p: ClubPlayer; onPhoto: (p: ClubPlayer) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run, isPending } = useAction();
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
        <Avatar name={p.name} photo={p.photo} size={94} />
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
        <Btn className="sm" disabled={busy} pending={isPending("upload")} onClick={() => input.current?.click()}>
          {p.photo ? "Change photo" : "Take / choose photo"}
        </Btn>
        {p.photo && (
          <Btn className="sm danger" disabled={busy} pending={isPending("remove")} onClick={remove}>
            Remove photo
          </Btn>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function EditSheet({ p, signedInAs, onClose, onSaved, onPhoto }: { p: ClubPlayer; signedInAs: string; onClose: () => void; onSaved: () => Promise<void>; onPhoto: (p: ClubPlayer) => void }) {
  const [name, setName] = useState(p.name);
  const [rating, setRating] = useState(String(p.rating));
  const [reason, setReason] = useState("");
  const [active, setActive] = useState(p.active);
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
      await patch(`/api/admin/players/${p.id}`, { name: name.trim(), rating: r, reason: reason.trim() || undefined, active });
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

export function AddSheet({ onClose, onSaved }: { onClose: () => void; onSaved: (player: ClubPlayer) => Promise<void> }) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState("");
  const { busy, error, run } = useAction();
  const save = () =>
    run(async () => {
      if (!name.trim()) throw new Error("Enter a name");
      if (!Number.isInteger(Number(rating)) || rating.trim() === "") throw new Error("Rating must be a whole number");
      const r = await post<{ player: ClubPlayer }>("/api/admin/players", { name: name.trim(), rating: Number(rating) });
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
        {error && <div className="error">{error}</div>}
        <div className="row">
          <Btn className="primary" disabled={busy} pending={busy} onClick={save}>Add</Btn>
          <Btn disabled={busy} onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}
