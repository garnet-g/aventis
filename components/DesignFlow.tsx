'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DesignWorkbench, type WorkbenchState } from '@/components/DesignWorkbench';
import { catalog, DELIVERY_FEE_PKR, type ProductId } from '@/lib/catalog';
import { postFormWithProgress } from '@/lib/clientUpload';
import { pkr } from '@/lib/labels';

type Outcome = { status: 'approved' | 'pending_review' | 'rejected'; message: string };

const STEPS = ['1 Design', '2 Check', '3 Pay'];

export function DesignFlow() {
  const router = useRouter();
  const state = useRef<WorkbenchState>({ product: 'tee', color: 'white', size: 'M', layers: [] });
  const designId = useRef<string | null>(null);
  const [product, setProduct] = useState<ProductId>('tee');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
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
      setUploadProgress(0);
      const { status, body } = await postFormWithProgress(`/api/designs/${designId.current}/upload`, form, setUploadProgress);
      const data = (body ?? {}) as { path?: string; error?: string };
      return status >= 200 && status < 300 && data.path ? { path: data.path } : { error: data.error ?? 'Upload failed, please try again.' };
    } catch {
      return { error: 'Upload failed, please try again.' };
    } finally {
      setUploadProgress(null);
    }
  }

  async function onContinue() {
    if (uploading) return; // never save while an image is still on its way
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

  const total = catalog[product].pricePkr + DELIVERY_FEE_PKR;

  return (
    <>
      <ol className="mx-auto flex w-full max-w-md gap-1.5 px-4 pb-3 text-[0.7rem] font-bold uppercase tracking-[0.12em]" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === 0 ? 'step' : undefined} className={`rounded-full border-[1.5px] border-ink px-2.5 py-1 ${i === 0 ? 'bg-ink text-paper' : ''}`}>
            {s}
          </li>
        ))}
      </ol>
      <DesignWorkbench
        uploadFile={uploadFile}
        onChange={(s) => {
          state.current = s;
          setProduct(s.product);
        }}
        onUploadingChange={setUploading}
        uploadProgress={uploadProgress}
      >
        {error && (
          <p role="alert" className="text-sm font-semibold text-vermilion">
            {error}
          </p>
        )}
        {outcome && (
          <p role="status" data-testid="design-outcome" className={`ticket text-sm font-semibold ${outcome.status === 'pending_review' ? 'bg-marigold/30' : ''}`}>
            {outcome.message}
          </p>
        )}
      </DesignWorkbench>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-ink text-paper">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 pb-4 pt-3">
          <div>
            <small className="block text-[0.7rem] text-[#bdb2a0]">Total with delivery</small>
            <b className="font-display text-2xl leading-none">{pkr(total)}</b>
          </div>
          <button data-testid="continue" disabled={busy || uploading} onClick={onContinue} className="btn btn-dock btn-sm">
            {busy ? 'Checking…' : uploading ? 'Uploading…' : 'Continue to checkout'}
          </button>
        </div>
      </div>
    </>
  );
}
