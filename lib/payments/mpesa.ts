import type { CheckResult, PaymentProvider, StartResult } from './index';

/**
 * M-Pesa through Safaricom's Daraja API: "Lipa na M-Pesa Online" (STK push). The customer gets a prompt on their phone,
 * enters their PIN, and Safaricom calls our callback URL with the result. `check` asks Daraja directly (STK push query),
 * which also confirms a callback is genuine (callbacks are not signed).
 *
 * Works with a Paybill (CustomerPayBillOnline) or a Till / Buy Goods number (CustomerBuyGoodsOnline).
 */
export type MpesaConfig = {
  env: 'sandbox' | 'production';
  consumerKey: string;
  consumerSecret: string;
  /** The business short code the passkey belongs to (for a till, the store / head office number). */
  shortcode: string;
  passkey: string;
  type: 'paybill' | 'till';
  /** Where the money goes for a till (PartyB); for a paybill it is the short code itself. */
  tillNumber?: string;
  /** The full URL Safaricom calls with the result, including the secret path part. */
  callbackUrl: string;
  /** Shown to the customer as the account (max 12 characters). */
  accountReference: string;
};

const BASE = { sandbox: 'https://sandbox.safaricom.co.ke', production: 'https://api.safaricom.co.ke' } as const;

export function mpesaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MpesaConfig {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`${k} must be set to take M-Pesa payments`);
    return v;
  };
  const site = (env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');
  if (!site.startsWith('https://') && env.MPESA_ENV === 'production') throw new Error('NEXT_PUBLIC_SITE_URL must be the public https address for M-Pesa callbacks');
  const type = env.MPESA_TRANSACTION_TYPE === 'till' ? 'till' : 'paybill';
  return {
    env: env.MPESA_ENV === 'production' ? 'production' : 'sandbox',
    consumerKey: need('MPESA_CONSUMER_KEY'),
    consumerSecret: need('MPESA_CONSUMER_SECRET'),
    shortcode: need('MPESA_SHORTCODE'),
    passkey: need('MPESA_PASSKEY'),
    type,
    tillNumber: type === 'till' ? need('MPESA_TILL_NUMBER') : undefined,
    callbackUrl: `${site}/api/payments/mpesa/${need('MPESA_CALLBACK_SECRET')}`,
    accountReference: (env.MPESA_ACCOUNT_REFERENCE ?? 'VibeCrew').slice(0, 12),
  };
}

/** "0712 345 678", "+254712345678" or "254712345678" -> "254712345678" (Safaricom's format), or null. */
export function toMpesaPhone(input: string): string | null {
  const s = input.replace(/[\s\-()]/g, '');
  const m = s.match(/^(?:\+?254|0)([17]\d{8})$/);
  return m ? `254${m[1]}` : null;
}

/** YYYYMMDDHHmmss in Nairobi time (East Africa Time, UTC+3, no daylight saving), as Daraja expects. */
export function darajaTimestamp(now: Date): string {
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${eat.getUTCFullYear()}${p(eat.getUTCMonth() + 1)}${p(eat.getUTCDate())}${p(eat.getUTCHours())}${p(eat.getUTCMinutes())}${p(eat.getUTCSeconds())}`;
}

/** What a few Daraja result codes mean, in words a customer understands. */
export function describeResult(code: string, fallback: string): string {
  switch (code) {
    case '1032':
      return 'The M-Pesa request was cancelled on the phone.';
    case '1037':
      return 'The phone did not answer the M-Pesa request in time.';
    case '1':
      return 'There is not enough money in the M-Pesa account.';
    case '2001':
      return 'The M-Pesa PIN was wrong.';
    case '1019':
      return 'The M-Pesa request expired.';
    case '1001':
      return 'Another M-Pesa request is already open on that phone. Finish it, then try again.';
    default:
      return fallback || 'M-Pesa could not take the payment.';
  }
}

export class MpesaProvider implements PaymentProvider {
  name = 'mpesa';
  isTestMode: boolean;
  private token: { value: string; until: number } | null = null;

  constructor(
    private readonly cfg: MpesaConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.isTestMode = cfg.env === 'sandbox';
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString('base64');
    const res = await this.fetchImpl(`${BASE[this.cfg.env]}/oauth/v1/generate?grant_type=client_credentials`, { headers: { authorization: `Basic ${basic}` } });
    if (!res.ok) throw new Error(`M-Pesa sign-in failed (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in: string | number };
    // tokens last an hour; refresh a minute early
    this.token = { value: body.access_token, until: Date.now() + (Number(body.expires_in) - 60) * 1000 };
    return body.access_token;
  }

  private password(timestamp: string) {
    return Buffer.from(`${this.cfg.shortcode}${this.cfg.passkey}${timestamp}`).toString('base64');
  }

  private async post(path: string, payload: unknown) {
    const res = await this.fetchImpl(`${BASE[this.cfg.env]}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await this.accessToken()}` },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, string | undefined>;
    return { ok: res.ok, body };
  }

  async start({ amountKes, phone, description }: { amountKes: number; reference: string; phone: string; description: string }): Promise<StartResult> {
    const timestamp = darajaTimestamp(this.now());
    const till = this.cfg.type === 'till';
    try {
      const { ok, body } = await this.post('/mpesa/stkpush/v1/processrequest', {
        BusinessShortCode: this.cfg.shortcode,
        Password: this.password(timestamp),
        Timestamp: timestamp,
        TransactionType: till ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        Amount: Math.round(amountKes),
        PartyA: phone,
        PartyB: till ? this.cfg.tillNumber : this.cfg.shortcode,
        PhoneNumber: phone,
        CallBackURL: this.cfg.callbackUrl,
        AccountReference: this.cfg.accountReference,
        TransactionDesc: description.slice(0, 13),
      });
      if (ok && body.ResponseCode === '0' && body.CheckoutRequestID) {
        return { status: 'pending', requestId: body.CheckoutRequestID, message: body.CustomerMessage ?? 'Check your phone to pay.' };
      }
      return { status: 'failed', reason: body.errorMessage ?? body.ResponseDescription ?? 'M-Pesa did not accept the request.' };
    } catch (e) {
      console.error('M-Pesa STK push failed', e);
      return { status: 'failed', reason: 'M-Pesa could not be reached. Please try again.' };
    }
  }

  async check(requestId: string): Promise<CheckResult> {
    const timestamp = darajaTimestamp(this.now());
    try {
      const { body } = await this.post('/mpesa/stkpushquery/v1/query', {
        BusinessShortCode: this.cfg.shortcode,
        Password: this.password(timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: requestId,
      });
      // While the customer is still deciding, Daraja answers with an error code instead of a result.
      if (body.errorCode) return { status: 'pending' };
      if (body.ResultCode === '0') return { status: 'paid' };
      if (body.ResultCode !== undefined) return { status: 'failed', reason: describeResult(String(body.ResultCode), body.ResultDesc ?? '') };
      return { status: 'pending' };
    } catch (e) {
      console.error('M-Pesa status check failed', e);
      return { status: 'pending' };
    }
  }
}

/** The parts of Safaricom's callback we use. */
export type StkCallback = {
  requestId: string;
  resultCode: string;
  resultDesc: string;
  receipt?: string;
  amountKes?: number;
};

/** Reads Safaricom's STK callback body ({ Body: { stkCallback: {...} } }); null when it isn't one. */
export function parseStkCallback(body: unknown): StkCallback | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string') return null;
  const items = ((cb.CallbackMetadata as { Item?: { Name: string; Value?: unknown }[] } | undefined)?.Item ?? []) as { Name: string; Value?: unknown }[];
  const item = (name: string) => items.find((i) => i.Name === name)?.Value;
  const amount = item('Amount');
  return {
    requestId: cb.CheckoutRequestID,
    resultCode: String(cb.ResultCode ?? ''),
    resultDesc: String(cb.ResultDesc ?? ''),
    receipt: typeof item('MpesaReceiptNumber') === 'string' ? (item('MpesaReceiptNumber') as string) : undefined,
    amountKes: typeof amount === 'number' ? amount : amount !== undefined ? Number(amount) : undefined,
  };
}
