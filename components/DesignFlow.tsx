'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DesignWorkbench, type WorkbenchState } from '@/components/DesignWorkbench';

type Outcome = { status: 'approved' | 'pending_review' | 'rejected'; message: string };

export function DesignFlow() {
  const router = useRouter();
  const state = useRef<WorkbenchState>({ product: 'tee', color: 'white', size: 'M', layers: [] });
  const designId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function save(): Promise<string> {
    const { product, color, size, layers } = state.current;
    const res = await fetch('/api/designs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: designId.current ?? undefined, product, color, size, layers }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Could not save your design.');
    designId.current = body.id;
    return body.id;
  }

  async function uploadFile(file: File): Promise<{ path: string } | { error: string }> {
    try {
      // Uploads belong to a design, so make sure one exists first (with no layers yet).
      if (!designId.current) {
        const { product, color, size } = state.current;
        const res = await fetch('/api/designs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ product, color, size, layers: [] }),
        });
        const body = await res.json();
        if (!res.ok) return { error: body.error ?? 'Could not start your design.' };
        designId.current = body.id;
      }
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/designs/${designId.current}/upload`, { method: 'POST', body: form });
      const body = await res.json();
      return res.ok ? { path: body.path } : { error: body.error ?? 'Upload failed.' };
    } catch {
      return { error: 'Upload failed, please try again.' };
    }
  }

  async function onContinue() {
    setBusy(true);
    setError('');
    setOutcome(null);
    try {
      const id = await save();
      const res = await fetch(`/api/designs/${id}/submit`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not check your design.');
      if (body.status === 'approved') return router.push(`/checkout/${id}`);
      setOutcome(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DesignWorkbench uploadFile={uploadFile} onChange={(s) => (state.current = s)}>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {outcome && (
        <p role="status" data-testid="design-outcome" className="rounded border p-3 text-sm">
          {outcome.message}
        </p>
      )}
      <button
        data-testid="continue"
        disabled={busy}
        onClick={onContinue}
        className="rounded bg-orange-600 p-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Checking your design…' : 'Continue to checkout'}
      </button>
    </DesignWorkbench>
  );
}
