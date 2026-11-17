/**
 * The business details shown on the legal and contact pages, the footer and receipts. Set them in the environment
 * (NEXT_PUBLIC_ so they can show in the browser); the defaults are placeholders to replace before launch.
 */
export const business = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? 'VybeCrew',
  legalName: process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME ?? 'VybeCrew (business registration pending)',
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'hello@vybecrew.co.ke',
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE ?? '0700 000 000',
  /** WhatsApp number in international form without "+", e.g. 254700000000. */
  whatsapp: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '254700000000',
  location: process.env.NEXT_PUBLIC_BUSINESS_LOCATION ?? 'Nairobi, Kenya',
  hours: process.env.NEXT_PUBLIC_BUSINESS_HOURS ?? 'Monday to Saturday, 9am to 6pm',
};

export const whatsappLink = (text?: string) => `https://wa.me/${business.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
