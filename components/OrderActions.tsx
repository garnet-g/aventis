'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function OrderActions({
  orderId,
  nextLabel,
  needsFiles,
}: {
  orderId: string;
  nextLabel: string | null;
  needsFiles: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function post(path: string) {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/orders/${orderId}/${path}`, { method: 'POST' });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'That did not work.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {nextLabel && (
          <button
            disabled={busy}
            onClick={() => post('status')}
            className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Mark as: {nextLabel}
          </button>
        )}
        {needsFiles && (
          <button
            disabled={busy}
            onClick={() => post('regenerate')}
            className="rounded border border-red-700 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            Regenerate files
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
