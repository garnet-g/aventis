import type { OrderStatus } from '@/lib/orders';

/**
 * Text messages to customers through Celcom Africa (https://celcomafrica.com), a Kenyan bulk SMS provider.
 * Settings: CELCOM_API_KEY, CELCOM_PARTNER_ID and CELCOM_SHORTCODE (the approved sender name), plus CELCOM_SMS_URL if
 * your account uses a different endpoint. Without them, messages are printed in the server log.
 */
export interface SmsSender {
  send(to: string, text: string): Promise<void>;
}

export class ConsoleSmsSender implements SmsSender {
  async send(to: string, text: string) {
    console.log(`[sms to ${to}] ${text}`);
  }
}

export class CelcomSmsSender implements SmsSender {
  constructor(
    private readonly cfg: { apiKey: string; partnerId: string; shortcode: string; url: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(to: string, text: string) {
    const res = await this.fetchImpl(this.cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apikey: this.cfg.apiKey, partnerID: this.cfg.partnerId, shortcode: this.cfg.shortcode, mobile: to, message: text }),
    });
    if (!res.ok) throw new Error(`SMS API returned ${res.status}`);
    // Celcom answers 200 with a per-message code inside; anything but 200 there is a failure.
    const body = (await res.json().catch(() => null)) as { responses?: { 'response-code'?: number; 'response-description'?: string }[] } | null;
    const first = body?.responses?.[0];
    if (first && first['response-code'] !== undefined && Number(first['response-code']) !== 200) {
      throw new Error(`SMS not sent: ${first['response-description'] ?? first['response-code']}`);
    }
  }
}

export function getSmsSender(env: NodeJS.ProcessEnv = process.env): SmsSender {
  const { CELCOM_API_KEY: apiKey, CELCOM_PARTNER_ID: partnerId, CELCOM_SHORTCODE: shortcode } = env;
  if (apiKey && partnerId && shortcode) {
    return new CelcomSmsSender({ apiKey, partnerId, shortcode, url: env.CELCOM_SMS_URL ?? 'https://isms.celcomafrica.com/api/services/sendsms/' });
  }
  return new ConsoleSmsSender();
}

/** "0712345678" / "+254712345678" -> "254712345678", the format SMS gateways in Kenya expect; null when not a mobile. */
export function toSmsPhone(input: string): string | null {
  const m = input.replace(/[\s\-()]/g, '').match(/^(?:\+?254|0)([17]\d{8})$/);
  return m ? `254${m[1]}` : null;
}

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const short = (id: string) => id.slice(0, 8).toUpperCase();

/** SMS texts are kept under 160 characters (one message) where possible. */
export const smsText = {
  paid: (args: { totalKes: number; receipt: string; orderIds: string[]; siteUrl: string }) =>
    `VibeCrew: we received ${kes(args.totalKes)} (ref ${args.receipt}). Order ${args.orderIds.map(short).join(', ')} is going to print. Track it: ${args.siteUrl}/orders`,
  status: (args: { status: OrderStatus; orderId: string; tracking?: string | null; siteUrl: string }) => {
    if (args.status === 'shipped') return `VibeCrew: order ${short(args.orderId)} is on its way.${args.tracking ? ` Tracking: ${args.tracking}.` : ''} ${args.siteUrl}/orders`;
    if (args.status === 'delivered') return `VibeCrew: order ${short(args.orderId)} was delivered. Asante! We hope you love it.`;
    return null;
  },
};

/** Sends a text and never throws: a failed SMS must not undo a payment or a status change. Returns whether it went. */
export async function sendSmsSafely(sms: SmsSender, phone: string, text: string | null): Promise<boolean> {
  const to = toSmsPhone(phone);
  if (!to || !text) return false;
  try {
    await sms.send(to, text);
    return true;
  } catch (e) {
    console.error('could not send SMS', e);
    return false;
  }
}
