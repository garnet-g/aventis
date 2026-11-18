import type { OrderStatus } from '@/lib/orders';

export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/** Local development: prints the email instead of sending it. */
export class ConsoleEmailSender implements EmailSender {
  async send(m: EmailMessage) {
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

  async send(m: EmailMessage) {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ from: this.from, to: m.to, subject: m.subject, text: m.text, ...(m.html && { html: m.html }) }),
    });
    if (!res.ok) throw new Error(`email API returned ${res.status}`);
  }
}

export function getEmailSender(): EmailSender {
  const key = process.env.RESEND_API_KEY;
  if (key) return new ResendEmailSender(key, process.env.EMAIL_FROM ?? 'VibeCrew <orders@vibecrew.co.ke>');
  return new ConsoleEmailSender();
}

export const getSiteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A plain VibeCrew email: black header, the message, one yellow button. Works in every mail app (tables, inline CSS). */
export function emailHtml(args: { title: string; lines: string[]; button?: { label: string; href: string } }): string {
  const lines = args.lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#111111">${escapeHtml(l)}</p>`).join('');
  const button = args.button
    ? `<p style="margin:22px 0 0"><a href="${escapeHtml(args.button.href)}" style="display:inline-block;background:#ffd60a;color:#0a0a0a;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:10px;border:2px solid #0a0a0a">${escapeHtml(args.button.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f4f1;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #0a0a0a;border-radius:14px;overflow:hidden">
<tr><td style="background:#0a0a0a;padding:18px 24px;font-size:22px;font-weight:800;color:#ffffff">Vibe<span style="color:#ffd60a">Crew</span></td></tr>
<tr><td style="padding:26px 24px"><h1 style="margin:0 0 16px;font-size:22px;color:#0a0a0a">${escapeHtml(args.title)}</h1>${lines}${button}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e2dfd2;font-size:12px;color:#5f5d55">VibeCrew &middot; Custom T-shirts and hoodies, printed in Nairobi and delivered across Kenya.</td></tr>
</table></td></tr></table></body></html>`;
}

function message(to: string, subject: string, title: string, lines: string[], button?: { label: string; href: string }): EmailMessage {
  const text = [...lines, ...(button ? [`${button.label}: ${button.href}`] : [])].join('\n\n');
  return { to, subject, text, html: emailHtml({ title, lines, button }) };
}

export async function notifyDecision(
  email: EmailSender,
  siteUrl: string,
  args: { to: string; decision: 'approved' | 'rejected'; designId: string; reason?: string },
): Promise<void> {
  if (args.decision === 'approved') {
    return email.send(
      message(args.to, 'Your design was approved', 'Your design was approved', ['Good news: your design has been checked and approved.', 'Open your prints and press Pay now to place your order.'], {
        label: 'Open your prints',
        href: `${siteUrl}/orders`,
      }),
    );
  }
  return email.send(
    message(
      args.to,
      'Your design could not be approved',
      'Your design could not be approved',
      ['Sorry, we could not approve your design.', `Reason: ${args.reason ?? 'This design cannot be printed.'}`],
      { label: 'Start a new design', href: `${siteUrl}/design` },
    ),
  );
}

/** The customer's receipt the moment the money arrives. */
export async function notifyOrderPaid(
  email: EmailSender,
  siteUrl: string,
  args: { to: string; orderCount: number; totalKes: number; receipt: string; paymentId: string },
): Promise<void> {
  const what = args.orderCount === 1 ? 'your order' : `your ${args.orderCount} orders`;
  await email.send(
    message(
      args.to,
      `Payment received: ${kes(args.totalKes)}`,
      'Thank you, we have your order',
      [
        `We received ${kes(args.totalKes)} for ${what}.`,
        `Payment reference: ${args.receipt}`,
        'Every design is printed by our partner in Nairobi. We will tell you when it ships.',
      ],
      { label: 'See your order', href: `${siteUrl}/orders/thank-you/${args.paymentId}` },
    ),
  );
}

const ORDER_EMAILS: Partial<Record<OrderStatus, { subject: string; line: string }>> = {
  shipped: { subject: 'Your order has shipped', line: 'Good news: your order is on its way.' },
  delivered: { subject: 'Your order was delivered', line: 'Your order has been delivered. We hope you love it!' },
};

/** Emails the customer when their order ships or is delivered. Returns whether an email was sent. */
export async function notifyOrderStatus(
  email: EmailSender,
  siteUrl: string,
  args: { to: string; status: OrderStatus; orderId: string; tracking?: string | null },
): Promise<boolean> {
  const content = ORDER_EMAILS[args.status];
  if (!content) return false;
  const lines = [content.line, ...(args.status === 'shipped' && args.tracking ? [`Tracking: ${args.tracking}`] : [])];
  await email.send(message(args.to, content.subject, content.subject, lines, { label: 'Follow your order', href: `${siteUrl}/orders` }));
  return true;
}

/** Tells the admins that a customer just paid, so they can pick the order up. */
export async function notifyNewOrder(
  email: EmailSender,
  siteUrl: string,
  args: { to: string[]; orderCount: number; totalKes: number },
): Promise<void> {
  const what = args.orderCount === 1 ? '1 new order' : `${args.orderCount} new orders`;
  await Promise.all(
    args.to.map((to) =>
      email.send(message(to, `New order: ${what}`, `${what}`, [`${what} just came in (KES ${args.totalKes.toLocaleString('en-US')} paid).`], { label: 'Open the orders', href: `${siteUrl}/admin/orders` })),
    ),
  );
}

/** Tells the admins a paid checkout could not become orders (a design changed while paying): refund it. */
export async function notifyRefundNeeded(email: EmailSender, siteUrl: string, args: { to: string[]; amountKes: number; receipt: string; reason: string }) {
  await Promise.all(
    args.to.map((to) =>
      email.send(message(to, `Refund needed: ${kes(args.amountKes)}`, 'A payment needs a refund', [`${kes(args.amountKes)} was paid (reference ${args.receipt}) but could not become an order.`, `Why: ${args.reason}`, 'Refund the customer through M-Pesa.'], { label: 'Open the payments', href: `${siteUrl}/admin/payments` })),
    ),
  );
}

/** Who gets new-order alerts: ADMIN_ALERT_EMAILS (comma separated) when set, otherwise every admin's own email. */
export async function adminAlertRecipients(
  env: string | undefined,
  allAdminEmails: () => Promise<string[]>,
): Promise<string[]> {
  const listed = (env ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return listed.length ? listed : allAdminEmails();
}
