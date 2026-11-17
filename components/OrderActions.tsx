'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, json, send } from '@/lib/clientFetch';
import type { OrderStatus } from '@/lib/orders';

/**
 * What an admin can do with an order: move it on (asking for the courier and tracking number when it ships), move it
 * back a step after a mis-click, cancel it before it ships, record a refund, and redraw missing files. Steps that
 * message the customer ask for confirmation first.
 */
export function OrderActions({
  orderId,
  next,
  nextLabel,
  backLabel,
  canCancel,
  paidKes,
  refunded,
  needsFiles,
}: {
  orderId: string;
  next: OrderStatus | null;
  nextLabel: string | null;
  backLabel: string | null;
  canCancel: boolean;
  paidKes: number;
  refunded: boolean;
  needsFiles: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'none' | 'advance' | 'cancel' | 'refund'>('none');
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const [reason, setReason] = useState('');
  const [refundKes, setRefundKes] = useState(String(paidKes));
  const [refundRef, setRefundRef] = useState('');

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    const r = await send(`/api/admin/orders/${orderId}/${path}`, body === undefined ? { method: 'POST' } : json('POST', body));
    setBusy(false);
    if (!r.ok) return setError(errorText(r, 'That did not work.'));
    setPanel('none');
    router.refresh();
  }

  const messagesCustomer = next === 'shipped' || next === 'delivered';
  return (
    <section className="ticket flex flex-col gap-3 text-sm" aria-label="Order actions">
      <div className="flex flex-wrap gap-2">
        {nextLabel && (
          <button disabled={busy} onClick={() => setPanel(panel === 'advance' ? 'none' : 'advance')} className="btn btn-ink btn-sm">
            Mark as: {nextLabel}
          </button>
        )}
        {backLabel && (
          <button disabled={busy} onClick={() => void post('back')} className="btn btn-quiet btn-sm">
            Back to: {backLabel}
          </button>
        )}
        {canCancel && (
          <button disabled={busy} onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')} className="btn btn-quiet btn-sm border-vermilion text-vermilion">
            Cancel order
          </button>
        )}
        {!refunded && (
          <button disabled={busy} onClick={() => setPanel(panel === 'refund' ? 'none' : 'refund')} className="btn btn-quiet btn-sm">
            Record a refund
          </button>
        )}
        {needsFiles && (
          <button disabled={busy} onClick={() => void post('regenerate')} className="btn btn-quiet btn-sm border-vermilion text-vermilion">
            Regenerate files
          </button>
        )}
      </div>

      {panel === 'advance' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post('status', next === 'shipped' ? { courier, tracking } : {});
          }}
        >
          {next === 'shipped' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 font-bold">
                Courier (optional)
                <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. G4S, Fargo, rider" maxLength={120} className="field font-normal" />
              </label>
              <label className="flex flex-col gap-1 font-bold">
                Tracking number (optional)
                <input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={120} className="field font-normal" />
              </label>
            </div>
          )}
          <p className="text-mute">{messagesCustomer ? 'The customer gets an email and an SMS about this.' : 'The customer is not messaged for this step.'}</p>
          <button disabled={busy} className="btn btn-ink btn-sm self-start">
            Confirm: {nextLabel}
          </button>
        </form>
      )}

      {panel === 'cancel' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post('cancel', { reason });
          }}
        >
          <label className="flex flex-col gap-1 font-bold">
            Why (the customer sees this)
            <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} className="field font-normal" />
          </label>
          <p className="text-mute">The customer gets an email and an SMS saying we will refund them. Send the refund by M-Pesa, then record it here.</p>
          <button disabled={busy} className="btn btn-sm self-start border-vermilion bg-vermilion text-white">
            Cancel this order
          </button>
        </form>
      )}

      {panel === 'refund' && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post('refund', { kes: Number(refundKes), ref: refundRef });
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 font-bold">
              Amount refunded (KES)
              <input value={refundKes} onChange={(e) => setRefundKes(e.target.value)} inputMode="numeric" required className="field font-normal" />
            </label>
            <label className="flex flex-col gap-1 font-bold">
              M-Pesa reference of the refund
              <input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} required minLength={4} maxLength={40} className="field font-normal" />
            </label>
          </div>
          <button disabled={busy} className="btn btn-ink btn-sm self-start">
            Save refund
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="font-semibold text-vermilion">
          {error}
        </p>
      )}
    </section>
  );
}
