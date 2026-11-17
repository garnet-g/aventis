'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DesignWorkbench, type InitialDesign, type WorkbenchState } from '@/components/DesignWorkbench';
import { type ProductId } from '@/lib/catalog';
import { errorText, json, OFFLINE_MESSAGE, send } from '@/lib/clientFetch';
import { postFormWithProgress, shrinkForUpload } from '@/lib/clientUpload';
import { kes } from '@/lib/labels';
import type { Prices } from '@/lib/prices';

type Outcome = { status: 'approved' | 'pending_review' | 'rejected'; message: string };
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STEPS = ['1 Design', '2 Check', '3 Pay'];
const AUTOSAVE_DELAY_MS = 1200;
const SAVE_TEXT: Record<SaveStatus, string> = { idle: '', saving: 'Saving…', saved: 'Saved ✓', error: 'Could not save. Check your connection.' };

const hasContent = (s: WorkbenchState) => s.layers.length > 0 || s.backLayers.length > 0;
/** What gets saved: everything except the browser-only image links. */
const snapshot = (s: WorkbenchState) => JSON.stringify([s.product, s.color, s.size, s.layers, s.backLayers]);

type Initial = InitialDesign & { id: string };

/**
 * Next keeps a page's state alive when you navigate away and come back. Once a design is in the cart it is
 * finished, so coming back to this page must start a blank design instead of reusing (and overwriting) it.
 */
export function DesignFlow({ initial, prices }: { initial?: Initial; prices: Prices }) {
  const finished = useRef(false);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    // Effects run again each time the kept page is shown, so a finished design is swapped for a fresh one here.
    if (finished.current) {
      finished.current = false;
      setEpoch((e) => e + 1);
    }
  }, []);
  return <DesignFlowInner key={epoch} initial={epoch === 0 ? initial : undefined} prices={prices} onFinished={() => (finished.current = true)} />;
}

function DesignFlowInner({ initial, prices, onFinished }: { initial?: Initial; prices: Prices; onFinished: () => void }) {
  const router = useRouter();
  // The design this page starts from. Only its first value is used (by the refs and states below).
  const start: WorkbenchState = initial
    ? { product: initial.product, color: initial.color, size: initial.size, layers: initial.layers, backLayers: initial.backLayers }
    : { product: 'tee', color: 'white', size: 'M', layers: [], backLayers: [] };
  const state = useRef<WorkbenchState>(start);
  const designId = useRef<string | null>(initial?.id ?? null);
  const creating = useRef<Promise<string> | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string | null>(initial ? snapshot(start) : null);
  const [product, setProduct] = useState<ProductId>(start.product);
  const [hasBack, setHasBack] = useState(start.backLayers.length > 0);
  const [hasAnything, setHasAnything] = useState(hasContent(start));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initial ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState(SAVE_TEXT.error);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  /** Makes sure the design exists on the server (uploads and saves both need its id). Only ever creates one. */
  async function ensureDesign(): Promise<string> {
    if (designId.current) return designId.current;
    creating.current ??= (async () => {
      const { product, color, size } = state.current;
      const r = await send('/api/designs', json('POST', { product, color, size, layers: [], backLayers: [] }));
      if (!r.ok) throw new Error(errorText(r, 'Could not start your design.'));
      designId.current = String(r.body.id);
      return designId.current;
    })().finally(() => {
      creating.current = null;
    });
    return creating.current;
  }

  /** Saves the current design. Saves run one after another, so a slow one can never overwrite a newer one. */
  function save(): Promise<string> {
    const run = async () => {
      const id = await ensureDesign();
      const s = state.current;
      const r = await send('/api/designs', json('POST', { id, product: s.product, color: s.color, size: s.size, layers: s.layers, backLayers: s.backLayers }));
      if (!r.ok) throw new Error(errorText(r, 'Could not save your design.'));
      lastSaved.current = snapshot(s);
      return String(r.body.id);
    };
    const next = saveChain.current.then(run, run);
    saveChain.current = next.catch(() => undefined);
    return next;
  }

  async function autosave() {
    if (!hasContent(state.current) || snapshot(state.current) === lastSaved.current) return;
    setSaveStatus('saving');
    try {
      await save();
      setSaveStatus('saved');
    } catch (e) {
      // Say why (e.g. "Design must stay inside the print area."); only a lost connection is about the connection.
      setSaveError(e instanceof Error && e.message !== OFFLINE_MESSAGE ? `Could not save: ${e.message}` : SAVE_TEXT.error);
      setSaveStatus('error');
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void autosave(), AUTOSAVE_DELAY_MS);
  }

  // Save right away when the page is hidden (switching apps, closing the tab), so nothing is lost.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        void autosave();
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFile(file: File): Promise<{ path: string } | { error: string }> {
    try {
      const id = await ensureDesign(); // uploads belong to a design
      const form = new FormData();
      form.append('file', await shrinkForUpload(file)); // big phone photos shrink first: less data, same print
      setUploadProgress(0);
      const { status, body } = await postFormWithProgress(`/api/designs/${id}/upload`, form, setUploadProgress);
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
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setBusy(true);
    setError('');
    setOutcome(null);
    try {
      const id = await save();
      setSaveStatus('saved');
      const checked = await send(`/api/designs/${id}/submit`, { method: 'POST' });
      if (!checked.ok) throw new Error(errorText(checked, 'Could not check your design.'));
      const result = checked.body as Outcome;
      if (result.status === 'approved') {
        const add = await send('/api/cart', json('POST', { designId: id }));
        if (!add.ok) throw new Error(errorText(add, 'Could not add it to your cart.'));
        onFinished();
        return router.push('/cart');
      }
      setOutcome(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveForLater() {
    if (uploading) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setBusy(true);
    setError('');
    try {
      await save();
      router.push('/orders');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your design.');
      setBusy(false);
    }
  }

  const total = prices[product].priceKes + (hasBack ? prices.backPriceKes : 0) + prices.deliveryFeeKes;

  return (
    <>
      <div className="shell flex items-center justify-between gap-2 py-4">
        <ol className="flex gap-1.5 text-[0.7rem] font-bold uppercase tracking-[0.12em]" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === 0 ? 'step' : undefined} className={`rounded-full border-[1.5px] border-ink px-2.5 py-1 ${i === 0 ? 'bg-ink text-paper' : ''}`}>
              {s}
            </li>
          ))}
        </ol>
        <span data-testid="save-status" aria-live="polite" className="text-xs font-semibold text-mute">
          {saveStatus === 'error' ? saveError : SAVE_TEXT[saveStatus]}
        </span>
      </div>

      <DesignWorkbench
        initial={initial}
        backPriceKes={prices.backPriceKes}
        uploadFile={uploadFile}
        onChange={(s) => {
          state.current = s;
          setProduct(s.product);
          setHasBack(s.backLayers.length > 0);
          setHasAnything(hasContent(s));
          if (hasContent(s) && snapshot(s) !== lastSaved.current) scheduleAutosave();
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
        <button className="btn btn-quiet btn-sm self-start" disabled={busy || uploading || !hasAnything} onClick={onSaveForLater}>
          Save for later
        </button>
      </DesignWorkbench>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-ink text-paper">
        <div className="shell flex items-center justify-between gap-3 pb-4 pt-3">
          <div>
            <small className="block text-[0.7rem] text-[#bdb2a0]">Total with delivery{hasBack ? ', incl. back print' : ''}</small>
            <b className="font-display text-2xl leading-none">{kes(total)}</b>
          </div>
          <button data-testid="continue" disabled={busy || uploading} onClick={onContinue} className="btn btn-dock btn-sm sm:min-w-56">
            {busy ? 'Working…' : uploading ? 'Uploading…' : 'Add to cart'}
          </button>
        </div>
      </div>
    </>
  );
}
