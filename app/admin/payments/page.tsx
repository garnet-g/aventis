import { Suspense } from 'react';
import { PaymentRefundButton } from '@/components/PaymentRefundButton';
import { requireAdmin } from '@/lib/auth';
import { kes } from '@/lib/labels';
import { toPayment } from '@/lib/paymentsStore';
import { getServiceClient } from '@/lib/supabase/server';

export const metadata = { title: 'Payments (admin)' };

export default function PaymentsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <Payments />
    </Suspense>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' });
const STATUS: Record<string, string> = { pending: 'Waiting for the phone', paid: 'Paid', failed: 'Failed', expired: 'No answer', needs_refund: 'Refund needed', refunded: 'Refunded' };

async function Payments() {
  await requireAdmin();
  const db = getServiceClient();
  const [{ data: refunds }, { data: recent }] = await Promise.all([
    db.from('payments').select('*').eq('status', 'needs_refund').order('created_at'),
    db.from('payments').select('*').order('created_at', { ascending: false }).limit(50),
  ]);
  const toRefund = (refunds ?? []).map((r) => toPayment(r as Parameters<typeof toPayment>[0]));
  const latest = (recent ?? []).map((r) => toPayment(r as Parameters<typeof toPayment>[0]));

  return (
    <main className="flex flex-col gap-8">
      <section>
        <h1 className="mb-2 font-display text-3xl font-extrabold tracking-tight">Payments</h1>
        <h2 className="mb-2 font-display text-xl font-extrabold">Refunds needed</h2>
        {toRefund.length === 0 ? (
          <p className="text-mute">Nothing to refund.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {toRefund.map((p) => (
              <li key={p.id} className="ticket flex flex-col gap-2 text-sm" data-testid="refund-needed">
                <p>
                  <b>{kes(p.amountKes)}</b> from {p.delivery.name} ({p.phone}) on {when(p.createdAt)} &middot; M-Pesa ref <b>{p.providerRef ?? '—'}</b>
                </p>
                <p className="text-mute">{p.failureReason}</p>
                <PaymentRefundButton paymentId={p.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-display text-xl font-extrabold">Latest payments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-ink">
                <th className="p-2">When</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Status</th>
                <th className="p-2">Reference</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((p) => (
                <tr key={p.id} className="border-b border-ink/20 align-top">
                  <td className="whitespace-nowrap p-2 text-xs">{when(p.createdAt)}</td>
                  <td className="p-2">
                    {p.delivery.name}
                    <br />
                    <span className="text-mute">{p.phone}</span>
                  </td>
                  <td className="whitespace-nowrap p-2">{kes(p.amountKes)}</td>
                  <td className="p-2">
                    {STATUS[p.status] ?? p.status}
                    {p.failureReason && p.status !== 'paid' ? <span className="block text-xs text-mute">{p.failureReason}</span> : null}
                  </td>
                  <td className="p-2 font-mono text-xs">{p.providerRef ?? p.requestId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
