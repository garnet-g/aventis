import { LegalPage } from '@/components/LegalPage';
import { business, whatsappLink } from '@/lib/business';

export const metadata = { title: 'Contact us', description: 'Reach VibeCrew on WhatsApp, phone or email.' };

export default function ContactPage() {
  return (
    <LegalPage eyebrow="Talk to us" title="Contact us">
      <p>Questions about an order, a design, bulk orders for a team or an event? We are happy to help.</p>
      <ul>
        <li>
          <b>WhatsApp:</b> <a href={whatsappLink('Hello VibeCrew!')}>{business.phone}</a>
        </li>
        <li>
          <b>Phone:</b> <span className="select-all">{business.phone}</span>
        </li>
        <li>
          <b>Email:</b> <a href={`mailto:${business.email}`}>{business.email}</a>
        </li>
        <li>
          <b>Where:</b> {business.location}
        </li>
        <li>
          <b>Hours:</b> {business.hours}
        </li>
      </ul>
      <p className="text-sm text-mute">{business.legalName}</p>
    </LegalPage>
  );
}
