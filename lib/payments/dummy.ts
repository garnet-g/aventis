import type { PaymentProvider } from './index';

/** Test-mode provider: always succeeds, never moves money. The ref is derived from the reference, so retries are idempotent. */
export class DummyProvider implements PaymentProvider {
  name = 'dummy';
  isTestMode = true;
  async charge({ reference }: { amountKes: number; reference: string }) {
    return { ok: true as const, paymentRef: `TEST-${reference}` };
  }
}
