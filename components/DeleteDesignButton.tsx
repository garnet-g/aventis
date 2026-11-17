'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, send } from '@/lib/clientFetch';

/** Deletes a saved design that was never ordered, after asking. */
export function DeleteDesignButton({ designId }: { designId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        disabled={busy}
        className="btn btn-quiet btn-sm mt-3"
        onClick={async () => {
          if (!confirm('Delete this design? This cannot be undone.')) return;
          setBusy(true);
          setError('');
          const r = await send(`/api/designs/${designId}`, { method: 'DELETE' });
          setBusy(false);
          if (!r.ok) return setError(errorText(r, 'Could not delete it.'));
          router.refresh();
        }}
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {error && <p className="mt-1 text-xs font-semibold text-vermilion">{error}</p>}
    </>
  );
}
