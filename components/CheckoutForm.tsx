'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, json, send } from '@/lib/clientFetch';
import { COUNTIES, NAIROBI_AREA } from '@/lib/counties';
import { kes } from '@/lib/labels';

type Saved = { name: string; phone: string; city: string; county: string; address: string } | null;

const POLL_MS = 3000;
const GIVE_UP_MS = 3 * 60_000;
const RESEND_AFTER_MS = 45_000;

/**
 * Delivery details and payment. With M-Pesa the customer gets a prompt on their phone; this form then waits, asking
 * the server every few seconds, and moves on to the thank-you page once the money has arrived.
 */
export function CheckoutForm({
  subtotalKes,
  deliveryNairobiKes,
  deliveryUpcountryKes,
  testMode,
  mpesa,
  saved,
}: {
  subtotalKes: number;
  deliveryNairobiKes: number;
  deliveryUpcountryKes: number;
  testMode: boolean;
  /** True when payments go through M-Pesa (a phone prompt); false for instant test payments. */
  mpesa: boolean;
  /** The delivery details from the customer's last order, to save typing. */
  saved: Saved;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [county, setCounty] = useState(saved?.county ?? '');
  const [waiting, setWaiting] = useState<{ paymentId: string; message: string; since: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastBody = useRef<unknown>(null);

  const deliveryKes = !county || NAIROBI_AREA.includes(county) ? deliveryNairobiKes : deliveryUpcountryKes;
  const totalKes = subtotalKes + deliveryKes;

  async function pay(body: unknown) {
    setBusy(true);
    setError('');
    const r = await send('/api/pay', json('POST', body));
    setBusy(false);
    // A dropped connection is safe to retry: paying for the same cart twice never charges twice.
    if (!r.ok) return setError(errorText(r, 'Payment failed. Please try again.'));
    if (r.body.status === 'pending') {
      setWaiting({ paymentId: String(r.body.paymentId), message: String(r.body.message ?? 'Check your phone.'), since: Date.now() });
      return;
    }
    router.push(r.body.paymentId ? `/orders/thank-you/${String(r.body.paymentId)}` : '/orders');
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const delivery = Object.fromEntries(['name', 'phone', 'city', 'county', 'address'].map((k) => [k, String(f.get(k) ?? '')]));
    const body = { delivery, mpesaPhone: String(f.get('mpesaPhone') ?? ''), acceptTerms: f.get('acceptTerms') === 'on' };
    lastBody.current = body;
    await pay(body);
  }

  // While waiting for the phone: ask the server every few seconds how the payment went.
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      setNow(Date.now());
      if (Date.now() - waiting.since > GIVE_UP_MS) {
        setWaiting(null);
        return setError('We did not hear back from M-Pesa. If money left your account, do not pay again: your order will appear under My orders, or contact us.');
      }
      const r = await send(`/api/payments/${waiting.paymentId}`);
      if (stopped) return;
      if (r.ok && r.body.status === 'paid') return router.push(`/orders/thank-you/${waiting.paymentId}`);
      if (r.ok && (r.body.status === 'failed' || r.body.status === 'needs_refund')) {
        setWaiting(null);
        return setError(typeof r.body.reason === 'string' && r.body.reason ? r.body.reason : 'The payment did not go through. Please try again.');
      }
      timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waiting, router]);

  if (waiting) {
    const canResend = now - waiting.since > RESEND_AFTER_MS;
    return (
      <section className="ticket flex flex-col gap-3" aria-live="polite" data-testid="mpesa-waiting">
        <h2 className="font-display text-2xl font-extrabold">Check your phone</h2>
        <p>
          An M-Pesa request for <b>{kes(totalKes)}</b> has been sent. Enter your M-Pesa PIN on your phone to pay.
        </p>
        <p className="text-sm text-mute">{waiting.message}</p>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-marigold" aria-hidden /> Waiting for M-Pesa…
        </p>
        {canResend && (
          <button type="button" className="btn btn-quiet btn-sm self-start" disabled={busy} onClick={() => void pay(lastBody.current)}>
            I didn&rsquo;t get the prompt: send it again
          </button>
        )}
      </section>
    );
  }

  const field = 'flex flex-col gap-1 text-sm font-bold';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-extrabold">Delivery details</h2>
      <label className={field} htmlFor="co-name">
        Full name
        <input id="co-name" name="name" required defaultValue={saved?.name} placeholder="Full name" autoComplete="name" className="field font-normal" />
      </label>
      <label className={field} htmlFor="co-phone">
        Mobile number
        <input id="co-phone" name="phone" required defaultValue={saved?.phone} placeholder="Mobile (0712345678)" inputMode="tel" autoComplete="tel" className="field font-normal" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field} htmlFor="co-city">
          Town or city
          <input id="co-city" name="city" required defaultValue={saved?.city} placeholder="City" autoComplete="address-level2" className="field font-normal" />
        </label>
        <label className={field} htmlFor="co-county">
          County
          <select id="co-county" name="county" required value={county} onChange={(e) => setCounty(e.target.value)} className="field font-normal" aria-label="County">
            <option value="" disabled>
              County
            </option>
            {COUNTIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <label className={field} htmlFor="co-address">
        Address and directions
        <textarea id="co-address" name="address" required rows={3} defaultValue={saved?.address} placeholder="Full address" autoComplete="street-address" className="field font-normal" />
      </label>
      <p className="text-xs text-mute">
        Delivery: {kes(deliveryNairobiKes)} in Nairobi, Kiambu, Machakos and Kajiado; {kes(deliveryUpcountryKes)} to the rest of Kenya.
      </p>

      {mpesa && (
        <>
          <h2 className="mt-2 font-display text-xl font-extrabold">Pay with M-Pesa</h2>
          <label className={field} htmlFor="co-mpesa">
            M-Pesa number (leave empty to use the mobile number above)
            <input id="co-mpesa" name="mpesaPhone" placeholder="07XX XXX XXX" inputMode="tel" autoComplete="tel" className="field font-normal" />
          </label>
        </>
      )}

      <label className="flex items-start gap-2 text-sm" htmlFor="co-terms">
        <input id="co-terms" name="acceptTerms" type="checkbox" required className="mt-1 h-4 w-4 flex-none" />
        <span>
          I agree to the{' '}
          <Link href="/terms" className="underline" target="_blank">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline" target="_blank">
            privacy policy
          </Link>
          , and I own or have permission to print everything in my designs.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
      <button disabled={busy} className="btn mt-1">
        {busy ? 'Processing…' : `Pay ${kes(totalKes)}${mpesa ? ' with M-Pesa' : ''}`}
      </button>
      {testMode && <p className="text-center text-xs text-mute">TEST MODE: no real money is charged.</p>}
    </form>
  );
}
