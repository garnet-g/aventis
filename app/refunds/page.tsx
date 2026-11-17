import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { business, whatsappLink } from '@/lib/business';

export const metadata = { title: 'Refunds and returns', description: 'What happens if your VybeCrew order is wrong, damaged or late.' };

export default function RefundsPage() {
  return (
    <LegalPage eyebrow="If something is wrong" title="Refunds and returns" updated="November 2026">
      <p>Every item is printed just for you, so we can&rsquo;t take back items you simply changed your mind about. If we got something wrong, we fix it.</p>
      <h2>We reprint or refund when</h2>
      <ul>
        <li>The print is faulty, misplaced, or different from the design you approved.</li>
        <li>You received the wrong size, colour or item.</li>
        <li>The item arrived damaged, or did not arrive.</li>
      </ul>
      <p>Tell us within 7 days of delivery, with your order number and a photo. We will reprint the item at no cost, or refund you to your M-Pesa number, as you prefer.</p>
      <h2>Cancelling</h2>
      <p>You can cancel and get a full refund until your order goes to print. After that it can&rsquo;t be cancelled.</p>
      <h2>Payments that didn&rsquo;t become an order</h2>
      <p>If M-Pesa took your money but no order appears under <Link href="/orders">My orders</Link>, contact us with the M-Pesa message. We refund it in full, usually within 2 working days.</p>
      <h2>Contact</h2>
      <p>
        <a href={whatsappLink('Hello VybeCrew, I need help with my order.')}>WhatsApp {business.phone}</a> or email <a href={`mailto:${business.email}`}>{business.email}</a>.
      </p>
    </LegalPage>
  );
}
