import type { OrderStatus } from '@/lib/orders';

export interface EmailSender {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

/** Local development: prints the email instead of sending it. */
export class ConsoleEmailSender implements EmailSender {
  async send(m: { to: string; subject: string; text: string }) {
    console.log(`[email to ${m.to}] ${m.subject}\n${m.text}`);
  }
}

/** Sends through Resend (https://resend.com). */
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(m: { to: string; subject: string; text: string }) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ from: this.from, to: m.to, subject: m.subject, text: m.text }),
    });
    if (!res.ok) throw new Error(`email API returned ${res.status}`);
  }
}

export function getEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  if (key) return new ResendEmailSender(key, process.env.EMAIL_FROM ?? 'orders@example.com');
  return new ConsoleEmailSender();
}

export const getSiteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export async function notifyDecision(
  email: EmailSender,
  siteUrl: string,
  args: { to: string; decision: 'approved' | 'rejected'; designId: string; reason?: string },
): Promise<void> {
  if (args.decision === 'approved') {
    return email.send({
      to: args.to,
      subject: 'Your design was approved',
      text: `Good news: your design has been checked and approved.\n\nOpen your prints and press Pay now to place your order: ${siteUrl}/orders`,
    });
  }
  return email.send({
    to: args.to,
    subject: 'Your design could not be approved',
    text: `Sorry, we could not approve your design.\n\nReason: ${args.reason ?? 'This design cannot be printed.'}\n\nYou can start a new design here: ${siteUrl}/design`,
  });
}

const ORDER_EMAILS: Partial<Record<OrderStatus, { subject: string; line: string }>> = {
  shipped: { subject: 'Your order has shipped', line: 'Good news: your order is on its way.' },
  delivered: { subject: 'Your order was delivered', line: 'Your order has been delivered. We hope you love it!' },
};

/** Emails the customer when their order ships or is delivered. Returns whether an email was sent. */
export async function notifyOrderStatus(
  email: EmailSender,
  siteUrl: string,
  args: { to: string; status: OrderStatus; orderId: string },
): Promise<boolean> {
  const content = ORDER_EMAILS[args.status];
  if (!content) return false;
  await email.send({ to: args.to, subject: content.subject, text: `${content.line}\n\nFollow your order here: ${siteUrl}/orders` });
  return true;
}

/** Tells the admins that a customer just paid, so they can pick the order up. */
export async function notifyNewOrder(
  email: EmailSender,
  siteUrl: string,
  args: { to: string[]; orderCount: number; totalKes: number },
): Promise<void> {
  const what = args.orderCount === 1 ? '1 new order' : `${args.orderCount} new orders`;
  const text = `${what} just came in (KES ${args.totalKes.toLocaleString('en-US')} paid).

Open the orders: ${siteUrl}/admin/orders`;
  await Promise.all(args.to.map((to) => email.send({ to, subject: `New order: ${what}`, text })));
}

/** Who gets new-order alerts: ADMIN_ALERT_EMAILS (comma separated) when set, otherwise every admin's own email. */
export async function adminAlertRecipients(
  env: string | undefined,
  allAdminEmails: () => Promise<string[]>,
): Promise<string[]> {
  const listed = (env ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return listed.length ? listed : allAdminEmails();
}
