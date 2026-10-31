import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { catalog } from '@/lib/catalog';
import { buildCustomerView } from '@/lib/customerItems';
import { toDesign, type DesignRow } from '@/lib/designsStore';
import type { OrderStatus } from '@/lib/orders';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function MyOrdersPage() {
  const user = await requireUser();
  // These queries run as the customer, so row-level security already limits them to their own rows.
  const db = await getServerClient();
  const [{ data: designRows }, { data: orderRows }] = await Promise.all([
    db.from('designs').select('*').order('updated_at', { ascending: false }),
    db.from('orders').select('design_id, user_id, status'),
  ]);
  const view = buildCustomerView(
    user.id,
    (designRows ?? []).map((r) => toDesign(r as DesignRow)),
    (orderRows ?? []).map((o) => ({ designId: o.design_id as string, userId: o.user_id as string, status: o.status as OrderStatus })),
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">My designs and orders</h1>
      {!view.length && (
        <p className="text-neutral-600">
          Nothing here yet. <Link className="underline" href="/design">Start your first design</Link>.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {view.map(({ design, state }) => (
          <li key={design.id} className="rounded border p-3 text-sm">
            <p className="font-semibold">
              {catalog[design.product].label} · {design.color === 'white' ? 'White' : 'Black'} · Size {design.size}
            </p>
            <p data-testid="design-state">{state.text}</p>
            {state.action && (
              <Link className="mt-2 inline-block rounded bg-black px-3 py-2 font-semibold text-white" href={state.action.href}>
                {state.action.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <Link className="text-sm underline" href="/design">
        New design
      </Link>
    </main>
  );
}
