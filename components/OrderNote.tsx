'use client';

import { useState } from 'react';
import { errorText, json, send } from '@/lib/clientFetch';

/** The private note admins keep on an order (customers never see it). */
export function OrderNote({ orderId, initial }: { orderId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    const r = await send(`/api/admin/orders/${orderId}/note`, json('PUT', { note }));
    setBusy(false);
    if (!r.ok) return setError(errorText(r, 'Could not save the note.'));
    const stored = typeof r.body.note === 'string' ? r.body.note : note;
    setNote(stored);
    setSaved(stored);
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
