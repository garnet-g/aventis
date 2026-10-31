import { DummyProvider } from './dummy';

export interface PaymentProvider {
  name: string;
  /** True for providers that never move real money; the checkout shows a TEST MODE banner. */
  isTestMode: boolean;
  /** `reference` is stable per design and MUST be used as the provider's idempotency key, so a retry never charges twice. */
  charge(args: {
    amountPkr: number;
    reference: string;
  }): Promise<{ ok: true; paymentRef: string } | { ok: false; reason: string }>;
}

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? 'dummy';
  if (name === 'dummy') return new DummyProvider();
  // Real providers (JazzCash, Easypaisa, a bank gateway) are added here as they are set up.
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
}
