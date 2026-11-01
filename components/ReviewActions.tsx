'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ReviewActions({ designId }: { designId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/designs/${designId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, reason: decision === 'reject' ? reason : undefined }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Could not save your decision.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason if rejecting (shown to the customer)"
        maxLength={300}
        className="field text-sm"
      />
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => decide('approve')}
          className="btn btn-sm bg-forest"
        >
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => decide('reject')}
          className="btn btn-sm btn-quiet border-vermilion text-vermilion"
        >
          Reject
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
    </div>
  );
}
