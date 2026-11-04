import { Suspense } from 'react';
import { PriceForm } from '@/components/PriceForm';
import { requireAdmin } from '@/lib/auth';
import { supabasePriceStore } from '@/lib/pricesStore';

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-mute">Loading…</p>}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requireAdmin();
  return (
    <main className="flex max-w-xl flex-col gap-4">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Prices</h1>
      <p className="text-sm text-mute">
        &ldquo;Customer pays&rdquo; is what is charged. &ldquo;Printer charges&rdquo; is what it costs you, and drives the profit shown on orders. A change
        applies to new carts and checkouts; orders already paid keep the price they were paid at. Bulk prices are taken off the whole price of each piece (garment and back print) and do not change what the printer charges, so they reduce your profit.
      </p>
      <PriceForm initial={await supabasePriceStore().get()} />
    </main>
  );
}
