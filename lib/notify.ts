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
      text: `Good news: your design has been checked and approved.\n\nPay here to place your order: ${siteUrl}/checkout/${args.designId}`,
    });
  }
  return email.send({
    to: args.to,
    subject: 'Your design could not be approved',
    text: `Sorry, we could not approve your design.\n\nReason: ${args.reason ?? 'This design cannot be printed.'}\n\nYou can start a new design here: ${siteUrl}/design`,
  });
}
