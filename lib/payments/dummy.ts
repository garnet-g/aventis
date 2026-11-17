import type { PaymentProvider } from './index';

/** Test-mode provider: always succeeds at once, never moves money. The ref comes from the reference, so retries match. */
export class DummyProvider implements PaymentProvider {
  name = 'dummy';
  isTestMode = true;
  async start({ reference }: { amountKes: number; reference: string; phone: string; description: string }) {
    return { status: 'paid' as const, paymentRef: `TEST-${reference}` };
  }
  async check() {
    return { status: 'paid' as const };
  }
}
