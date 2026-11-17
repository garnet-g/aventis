import Link from 'next/link';
import { Suspense } from 'react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { DeleteDesignButton } from '@/components/DeleteDesignButton';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { catalog, colorLabel } from '@/lib/catalog';
import { buildCustomerView, type Tone } from '@/lib/customerItems';
import { toDesign, type DesignRow } from '@/lib/designsStore';
import type { OrderStatus } from '@/lib/orders';
import { kes } from '@/lib/labels';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

const BADGE: Record<Tone, string> = { gold: 'badge-gold', forest: 'badge-forest', ink: 'badge-ink', red: 'badge-red' };
const TRACK: { key: OrderStatus; label: string }[] = [
  { key: 'paid', label: 'Paid' },
  { key: 'at_printer', label: 'At printer' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

export const metadata = { title: 'Your prints' };

export default function MyOrdersPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
        <MyOrders />
      </Suspense>
    </>
  );
}

function Track({ status }: { status: OrderStatus }) {
  const at = TRACK.findIndex((t) => t.key === status);
  return (
    <div className="mt-3" aria-label={`Order progress: ${TRACK[at].label}`}>
      <div className="flex items-center">
        {TRACK.map((t, i) => (
          <div key={t.key} className="flex flex-1 items-center last:flex-none">
            <i className={`h-3.5 w-3.5 flex-none rounded-full border-2 ${i <= at ? 'border-forest bg-forest' : 'border-ink bg-white'}`} />
            {i < TRACK.length - 1 && <s className={`h-0.5 flex-1 ${i < at ? 'bg-forest' : 'bg-ink/25'}`} />}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.65rem] tracking-wide text-mute">
        {TRACK.map((t) => (
          <span key={t.key}>{t.label}</span>
        ))}
      </div>
    </div>
  );
}

type Card = ReturnType<typeof buildCustomerView>[number] & { thumb: string | null; order?: OrderExtra };
type OrderExtra = { tracking: string | null; cancelReason: string | null; refundedKes: number | null; createdAt: string };

async function MyOrders() {
  const user = await requireUser('/orders');
  // These queries run as the customer, so row-level security already limits them to their own rows.
  const db = await getServerClient();
  const [{ data: designRows }, { data: orderRows }] = await Promise.all([
    db.from('designs').select('*').order('updated_at', { ascending: false }),
    db.from('orders').select('design_id, user_id, status, quantity, mockup_path, courier, tracking, cancel_reason, refunded_kes, created_at').order('created_at', { ascending: false }),
  ]);
  const orders = orderRows ?? [];
  const view = buildCustomerView(
    user.id,
    (designRows ?? []).map((r) => toDesign(r as DesignRow)),
    orders.map((o) => ({ designId: o.design_id as string, userId: o.user_id as string, status: o.status as OrderStatus, quantity: o.quantity as number })),
  );
  // the saved picture of each order (private files, through short-lived links; the rows above are already the customer's own)
  const paths = orders.map((o) => o.mockup_path as string | null).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length ? await getServiceClient().storage.from('artifacts').createSignedUrls(paths, 3600) : { data: [] };
  const signedUrl = new Map((signed ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
  const byDesign = new Map(orders.map((o) => [o.design_id as string, o]));

  const cards: Card[] = view.map((v) => {
    const o = byDesign.get(v.design.id);
    const hasArt = v.design.layers.length > 0 || v.design.backLayers.length > 0;
    const preview = hasArt ? `/api/designs/${v.design.id}/preview?v=${encodeURIComponent(v.design.version)}` : null;
    if (!o) return { ...v, thumb: preview };
    return {
      ...v,
      thumb: (o.mockup_path && signedUrl.get(o.mockup_path as string)) || preview,
      order: {
        tracking: [o.courier, o.tracking].filter(Boolean).join(' ') || null,
        cancelReason: (o.cancel_reason as string | null) ?? null,
        refundedKes: (o.refunded_kes as number | null) ?? null,
        createdAt: o.created_at as string,
      },
    };
  });
  const ordered = cards.filter((c) => c.orderStatus);
  const saved = cards.filter((c) => !c.orderStatus);

  return (
    <main className="shell flex flex-col gap-8 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your prints</h1>
      {!cards.length && (
        <p className="text-mute">
          Nothing here yet. <Link className="underline" href="/design" prefetch={false}>Start your first design</Link> or <Link className="underline" href="/catalogue">pick one from the catalogue</Link>.
        </p>
      )}
      {ordered.length > 0 && (
        <section aria-labelledby="orders-h" className="flex flex-col gap-3">
          <h2 id="orders-h" className="font-display text-xl font-extrabold">Orders</h2>
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {ordered.map((c) => (
              <PrintCard key={c.design.id} card={c} />
            ))}
          </ul>
        </section>
      )}
      {saved.length > 0 && (
        <section aria-labelledby="saved-h" className="flex flex-col gap-3">
          <h2 id="saved-h" className="font-display text-xl font-extrabold">Saved designs</h2>
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {saved.map((c) => (
              <PrintCard key={c.design.id} card={c} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

const ordered = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' });

function PrintCard({ card: { design, state, orderStatus, quantity, thumb, order } }: { card: Card }) {
  return (
    <li className="ticket flex gap-4" data-testid="print-card">
      <div className="h-28 w-24 flex-none overflow-hidden rounded-lg border-2 border-ink bg-paper-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-mute">Empty</div>}
      </div>
      <div className="min-w-0 flex-1">
        <span data-testid="design-state" className={`badge ${BADGE[state.tone]}`}>
          {state.text}
        </span>
        <p className="mt-2 font-display text-lg font-extrabold leading-tight">
          {catalog[design.product].label} &middot; {colorLabel(design.color)} &middot; {design.size}
          {quantity && quantity > 1 ? ` × ${quantity}` : ''}
        </p>
        {order && <p className="text-xs text-mute">Ordered {ordered(order.createdAt)}</p>}
        {orderStatus && orderStatus !== 'cancelled' && <Track status={orderStatus} />}
        {order?.tracking && orderStatus !== 'cancelled' && <p className="mt-2 text-sm">Tracking: <b>{order.tracking}</b></p>}
        {order?.cancelReason && <p className="mt-2 text-sm">Why: {order.cancelReason}</p>}
        {order?.refundedKes ? <p className="mt-1 text-sm">Refunded {kes(order.refundedKes)} to your M-Pesa.</p> : orderStatus === 'cancelled' ? <p className="mt-1 text-sm text-mute">Your refund is on its way.</p> : null}
        <div className="flex flex-wrap gap-2">
          {state.action &&
            (state.action.addToCart ? (
              <AddToCartButton designId={state.action.addToCart} href={state.action.href} label={state.action.label} />
            ) : (
              <Link className="btn btn-sm mt-3" href={state.action.href}>
                {state.action.label}
              </Link>
            ))}
          {!orderStatus && <DeleteDesignButton designId={design.id} />}
        </div>
      </div>
    </li>
  );
}
