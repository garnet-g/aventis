import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { business } from '@/lib/business';

export const metadata = { title: 'Terms of sale', description: 'The terms for ordering custom and ready-made clothing from VybeCrew.' };

export default function TermsPage() {
  return (
    <LegalPage eyebrow="The small print" title="Terms of sale" updated="November 2026">
      <p>
        These terms apply when you order from {business.name} ({business.legalName}), {business.location}. By placing an order you agree to them. If anything is unclear,{' '}
        <Link href="/contact">contact us</Link> before you pay.
      </p>
      <h2>Your designs</h2>
      <ul>
        <li>You must own, or have permission to use, everything you upload or type: pictures, logos, names and words.</li>
        <li>Do not order designs that use other brands&rsquo; logos or trademarks (for example sports clubs or clothing brands), other people&rsquo;s photos, or art you don&rsquo;t have the rights to.</li>
        <li>Every design is checked before printing. We refuse anything explicit, hateful, violent, illegal, or that appears to break someone else&rsquo;s rights, and may cancel and refund an order for these reasons.</li>
        <li>You keep the rights to your designs. You allow us to store and print them, and to show them to our printing partner, only to make your order.</li>
      </ul>
      <h2>Prices and payment</h2>
      <ul>
        <li>Prices are in Kenya shillings and include the printing. Delivery is added at checkout and depends on your county.</li>
        <li>Bulk prices apply automatically when your cart holds enough pieces.</li>
        <li>We take payment by M-Pesa. Your order is placed once M-Pesa confirms the payment; you get a receipt by SMS and email.</li>
      </ul>
      <h2>Colours and print size</h2>
      <p>
        Screens show colours differently, so printed colours can look slightly different. The print area is shown in the designer; we print your design at the size and place you set,
        within that area. Pictures with low resolution may print soft: the designer warns you when a picture is too small.
      </p>
      <h2>Printing, delivery and cancelling</h2>
      <ul>
        <li>Because every item is printed for you, an order can only be cancelled before it goes to print. Contact us as soon as possible.</li>
        <li>See <Link href="/delivery">delivery</Link> for times and costs, and <Link href="/refunds">refunds and returns</Link> for what happens if something is wrong.</li>
      </ul>
      <h2>Accounts</h2>
      <p>Keep your password private. You can delete your account at any time from your account page; we keep order records the law requires.</p>
      <h2>Disputes</h2>
      <p>These terms are governed by the laws of Kenya. Nothing here limits your rights under the Consumer Protection Act, 2012.</p>
    </LegalPage>
  );
}
