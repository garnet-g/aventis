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
            className="btn btn-ink btn-sm"
          >
            Mark as: {nextLabel}
          </button>
        )}
        {needsFiles && (
          <button
            disabled={busy}
            onClick={() => post('regenerate')}
            className="btn btn-quiet btn-sm border-vermilion text-vermilion"
          >
            Regenerate files
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
    </div>
  );
}
