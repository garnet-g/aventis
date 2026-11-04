'use client';

import { useState } from 'react';

/** The private note admins keep on an order (customers never see it). */
export function OrderNote({ orderId, initial }: { orderId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/orders/${orderId}/note`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Could not save the note.');
    const body = await res.json();
    setNote(body.note);
    setSaved(body.note);
  }

  return (
    <section className="ticket text-sm">
      <h2 className="mb-1 font-semibold">Private note</h2>
      <textarea
        aria-label="Private note"
        value={note}
        maxLength={1000}
        rows={3}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Only admins see this: printer promised Friday, customer asked to call, …"
        className="field w-full"
      />
      {error && (
        <p role="alert" className="mt-1 font-semibold text-vermilion">
          {error}
        </p>
      )}
      <button disabled={busy || note.trim() === saved} onClick={save} className="btn btn-ink btn-sm mt-2">
        {busy ? 'Saving…' : note.trim() === saved && saved ? 'Note saved ✓' : 'Save note'}
      </button>
    </section>
  );
}
