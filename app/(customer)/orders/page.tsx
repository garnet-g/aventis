import Link from 'next/link';
import { Suspense } from 'react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { SiteHeader } from '@/components/SiteHeader';
import { requireUser } from '@/lib/auth';
import { catalog } from '@/lib/catalog';
import { buildCustomerView, type Tone } from '@/lib/customerItems';
import { toDesign, type DesignRow } from '@/lib/designsStore';
import type { OrderStatus } from '@/lib/orders';
import { getServerClient } from '@/lib/supabase/server';

const BADGE: Record<Tone, string> = { gold: 'badge-gold', forest: 'badge-forest', ink: 'badge-ink', red: 'badge-red' };
const TRACK: { key: OrderStatus; label: string }[] = [
  { key: 'paid', label: 'Paid' },
  { key: 'at_printer', label: 'At printer' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

export default function MyOrdersPage() {
  return (
    <>
      <SiteHeader
        right={
          <span className="flex gap-4">
            <Link href="/cart">Cart</Link>
            <Link href="/design">+ New</Link>
          </span>
        }
      />
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

async function MyOrders() {
  const user = await requireUser();
  // These queries run as the customer, so row-level security already limits them to their own rows.
  const db = await getServerClient();
  const [{ data: designRows }, { data: orderRows }] = await Promise.all([
    db.from('designs').select('*').order('updated_at', { ascending: false }),
    db.from('orders').select('design_id, user_id, status, quantity'),
  ]);
  const view = buildCustomerView(
    user.id,
    (designRows ?? []).map((r) => toDesign(r as DesignRow)),
    (orderRows ?? []).map((o) => ({ designId: o.design_id as string, userId: o.user_id as string, status: o.status as OrderStatus, quantity: o.quantity as number })),
  );

  return (
    <main className="shell flex flex-col gap-6 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Your prints</h1>
      {!view.length && (
        <p className="text-mute">
          Nothing here yet. <Link className="underline" href="/design">Start your first design</Link>.
        </p>
      )}
      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {view.map(({ design, state, orderStatus, quantity }) => (
          <li key={design.id} className="ticket">
            <span data-testid="design-state" className={`badge ${BADGE[state.tone]}`}>
              {state.text}
            </span>
            <p className="mt-2 font-display text-lg font-extrabold">
              {catalog[design.product].label} &middot; {design.color === 'white' ? 'White' : 'Black'} &middot; {design.size}
              {quantity && quantity > 1 ? ` × ${quantity}` : ''}
            </p>
            {orderStatus && <Track status={orderStatus} />}
            {state.action &&
              (state.action.addToCart ? (
                <AddToCartButton designId={state.action.addToCart} href={state.action.href} label={state.action.label} />
              ) : (
                <Link className="btn btn-sm mt-3" href={state.action.href}>
                  {state.action.label}
                </Link>
              ))}
          </li>
        ))}
      </ul>
    </main>
  );
}
