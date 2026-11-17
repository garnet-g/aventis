import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';
import { business } from '@/lib/business';

export const metadata = { title: 'Privacy policy', description: 'How VybeCrew collects, uses and protects your personal data under Kenya’s Data Protection Act, 2019.' };

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Your data" title="Privacy policy" updated="November 2026">
      <p>
        {business.name} ({business.legalName}) is the data controller for the personal data you give us. We follow Kenya&rsquo;s Data Protection Act, 2019. Questions or requests:{' '}
        <a href={`mailto:${business.email}`}>{business.email}</a>.
      </p>
      <h2>What we collect, and why</h2>
      <ul>
        <li><b>Account:</b> your email address and a password (stored scrambled), to sign you in and keep your designs and orders.</li>
        <li><b>Designs:</b> the pictures and text you add, to check, print and show them to you.</li>
        <li><b>Delivery:</b> your name, mobile number, town, county and address, to deliver your order and contact you about it.</li>
        <li><b>Payment:</b> your M-Pesa number and the payment reference. We never see your M-Pesa PIN.</li>
        <li><b>Technical:</b> basic logs (such as your device&rsquo;s IP address) to keep the service secure and working.</li>
      </ul>
      <h2>Who we share it with</h2>
      <ul>
        <li>Our printing partner (your design files and order details) and our delivery partner (your name, phone and address).</li>
        <li>Safaricom M-Pesa, to take your payment; our SMS and email providers, to send you order updates.</li>
        <li>Our hosting and storage provider, which keeps the data on our behalf.</li>
        <li>Pictures may be sent to an automated safety-check service so explicit images are not printed.</li>
      </ul>
      <p>We do not sell your data and do not use it for advertising.</p>
      <h2>How long we keep it</h2>
      <p>
        Order and payment records are kept for as long as Kenyan tax and business law requires. Designs you never order may be deleted after 90 days. You can delete your account at
        any time from your <Link href="/account">account page</Link>.
      </p>
      <h2>Your rights</h2>
      <p>
        You may ask to see, correct, download or delete your personal data, and object to how it is used. Use your <Link href="/account">account page</Link> or email us. You can also
        complain to the Office of the Data Protection Commissioner (ODPC).
      </p>
      <h2>Security</h2>
      <p>Your designs and order files are kept private and only shown to you and to our staff who handle orders. Connections to the site are encrypted.</p>
    </LegalPage>
  );
}
