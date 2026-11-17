import { DummyProvider } from './dummy';
import { mpesaConfigFromEnv, MpesaProvider } from './mpesa';

/** How a request for money went. Test mode answers at once; M-Pesa sends a prompt to the phone and answers later. */
export type StartResult =
  | { status: 'paid'; paymentRef: string }
  | { status: 'pending'; requestId: string; message: string }
  | { status: 'failed'; reason: string };

/** How a pending payment ended, asked of the provider (used when its callback is late or lost). */
export type CheckResult = { status: 'paid' } | { status: 'pending' } | { status: 'failed'; reason: string };

export interface PaymentProvider {
  name: string;
  /** True for providers that never move real money; the checkout shows a TEST MODE banner. */
  isTestMode: boolean;
  /**
   * Asks the customer for `amountKes`. `reference` identifies this exact cart; `phone` is the M-Pesa number in
   * 2547XXXXXXXX / 2541XXXXXXXX form; `description` is a few words shown on the customer's phone.
   */
  start(args: { amountKes: number; reference: string; phone: string; description: string }): Promise<StartResult>;
  check(requestId: string): Promise<CheckResult>;
}

/** PAYMENT_PROVIDER: "mpesa" (Safaricom Daraja STK push) or "dummy" (test mode, no money moves). */
export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? 'dummy';
  if (name === 'dummy') return new DummyProvider();
  if (name === 'mpesa') return new MpesaProvider(mpesaConfigFromEnv());
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
}
