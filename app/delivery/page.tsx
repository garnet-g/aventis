import { Suspense } from 'react';
import { LegalPage } from '@/components/LegalPage';
import { TURNAROUND } from '@/lib/catalog';
import { NAIROBI_AREA } from '@/lib/counties';
import { kes } from '@/lib/labels';
import { DEFAULT_PRICES } from '@/lib/prices';
import { supabasePriceStore } from '@/lib/pricesStore';

export const metadata = { title: 'Delivery', description: 'How long VybeCrew orders take and what delivery costs across Kenya.' };

export default function DeliveryPage() {
  return (
    <LegalPage eyebrow="Getting it to you" title="Delivery">
      <h2>How long it takes</h2>
      <ul>
        <li>Printing: {TURNAROUND.printing} after you pay.</li>
        <li>Delivery in {NAIROBI_AREA.join(', ')}: {TURNAROUND.nairobi} after printing.</li>
        <li>Delivery to the rest of Kenya: {TURNAROUND.upcountry} after printing.</li>
      </ul>
      <p>You get an SMS when your order ships, with tracking where the courier provides it.</p>
      <h2>What it costs</h2>
      <Suspense fallback={<Fees prices={DEFAULT_PRICES} />}>
        <LiveFees />
      </Suspense>
      <p>Delivery is charged once per order, however many items it holds.</p>
    </LegalPage>
  );
}

const Fees = ({ prices }: { prices: typeof DEFAULT_PRICES }) => (
  <ul>
    <li>Nairobi area ({NAIROBI_AREA.join(', ')}): {kes(prices.deliveryFeeKes)}</li>
    <li>Rest of Kenya: {kes(prices.deliveryFeeUpcountryKes)}</li>
  </ul>
);
const LiveFees = async () => <Fees prices={await supabasePriceStore().get()} />;
