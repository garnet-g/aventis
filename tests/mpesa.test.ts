import { describe, expect, test } from 'vitest';
import { darajaTimestamp, describeResult, MpesaProvider, parseStkCallback, toMpesaPhone, type MpesaConfig } from '@/lib/payments/mpesa';

const cfg: MpesaConfig = {
  env: 'sandbox',
  consumerKey: 'key',
  consumerSecret: 'secret',
  shortcode: '174379',
  passkey: 'passkey',
  type: 'paybill',
  callbackUrl: 'https://shop.example/api/payments/mpesa/s3cret',
  accountReference: 'VybeCrew',
};

/** A fake Daraja that records requests and answers from a script. */
function fakeDaraja(answers: Record<string, unknown>) {
  const calls: { url: string; body: Record<string, unknown> | null; auth: string | null }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, body, auth: new Headers(init?.headers).get('authorization') });
    const path = new URL(url).pathname;
    if (path === '/oauth/v1/generate') return new Response(JSON.stringify({ access_token: 'tok', expires_in: '3599' }));
    return new Response(JSON.stringify(answers[path] ?? {}), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('phone numbers', () => {
  test.each([
    ['0712345678', '254712345678'],
    ['0712 345 678', '254712345678'],
    ['+254712345678', '254712345678'],
    ['254112345678', '254112345678'],
    ['0112345678', '254112345678'],
  ])('%s becomes %s', (input, out) => expect(toMpesaPhone(input)).toBe(out));

  test.each(['', '12345', '0812345678', '+255712345678', '07123456789'])('%s is refused', (input) => expect(toMpesaPhone(input)).toBeNull());
});

test('the Daraja timestamp is Nairobi time (UTC+3)', () => {
  expect(darajaTimestamp(new Date('2026-11-17T21:05:09Z'))).toBe('20261118000509');
});

describe('STK push', () => {
  test('asks the phone to pay the exact amount, to the paybill, with the callback URL and a valid password', async () => {
    const { calls, fetchImpl } = fakeDaraja({
      '/mpesa/stkpush/v1/processrequest': { ResponseCode: '0', CheckoutRequestID: 'ws_CO_1', CustomerMessage: 'Success. Request accepted for processing' },
    });
    const now = new Date('2026-11-17T09:00:00Z');
    const p = new MpesaProvider(cfg, fetchImpl, () => now);
    const r = await p.start({ amountKes: 2650, reference: 'ref', phone: '254712345678', description: 'VybeCrew order' });
    expect(r).toEqual({ status: 'pending', requestId: 'ws_CO_1', message: 'Success. Request accepted for processing' });
    const push = calls.find((c) => c.url.endsWith('/processrequest'))!;
    expect(push.auth).toBe('Bearer tok');
    expect(push.body).toMatchObject({
      BusinessShortCode: '174379',
      Timestamp: '20261117120000',
      TransactionType: 'CustomerPayBillOnline',
      Amount: 2650,
      PartyA: '254712345678',
      PartyB: '174379',
      PhoneNumber: '254712345678',
      CallBackURL: 'https://shop.example/api/payments/mpesa/s3cret',
      AccountReference: 'VybeCrew',
    });
    expect(Buffer.from(String(push.body!.Password), 'base64').toString()).toBe('174379passkey20261117120000');
    expect(calls[0].auth).toBe(`Basic ${Buffer.from('key:secret').toString('base64')}`);
  });

  test('a till number pays with Buy Goods to the till', async () => {
    const { calls, fetchImpl } = fakeDaraja({ '/mpesa/stkpush/v1/processrequest': { ResponseCode: '0', CheckoutRequestID: 'x' } });
    await new MpesaProvider({ ...cfg, type: 'till', tillNumber: '5544332' }, fetchImpl).start({ amountKes: 100, reference: 'r', phone: '254712345678', description: 'd' });
    expect(calls.find((c) => c.url.endsWith('/processrequest'))!.body).toMatchObject({ TransactionType: 'CustomerBuyGoodsOnline', PartyB: '5544332' });
  });

  test('a refused request is a failed payment with the reason', async () => {
    const { fetchImpl } = fakeDaraja({ '/mpesa/stkpush/v1/processrequest': { errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid PhoneNumber' } });
    expect(await new MpesaProvider(cfg, fetchImpl).start({ amountKes: 100, reference: 'r', phone: '254712345678', description: 'd' })).toEqual({
      status: 'failed',
      reason: 'Bad Request - Invalid PhoneNumber',
    });
  });
});

describe('status check', () => {
  const check = async (answer: unknown) => new MpesaProvider(cfg, fakeDaraja({ '/mpesa/stkpushquery/v1/query': answer }).fetchImpl).check('ws_CO_1');
  test('paid, cancelled, timed out and still waiting', async () => {
    expect(await check({ ResultCode: '0', ResultDesc: 'The service request is processed successfully.' })).toEqual({ status: 'paid' });
    expect(await check({ ResultCode: '1032', ResultDesc: 'Request cancelled by user' })).toEqual({ status: 'failed', reason: 'The M-Pesa request was cancelled on the phone.' });
    expect(await check({ ResultCode: '1037', ResultDesc: 'DS timeout' })).toEqual({ status: 'failed', reason: 'The phone did not answer the M-Pesa request in time.' });
    expect(await check({ errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' })).toEqual({ status: 'pending' });
  });
});

test('describeResult falls back to Safaricom\'s own words for codes it doesn\'t know', () => {
  expect(describeResult('9999', 'Something odd')).toBe('Something odd');
});

describe('callback', () => {
  test('a successful callback gives the receipt and the amount', () => {
    expect(
      parseStkCallback({
        Body: {
          stkCallback: {
            MerchantRequestID: 'm1',
            CheckoutRequestID: 'ws_CO_1',
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: { Item: [{ Name: 'Amount', Value: 2650 }, { Name: 'MpesaReceiptNumber', Value: 'TKH7Q2XYZ1' }, { Name: 'PhoneNumber', Value: 254712345678 }] },
          },
        },
      }),
    ).toEqual({ requestId: 'ws_CO_1', resultCode: '0', resultDesc: 'The service request is processed successfully.', receipt: 'TKH7Q2XYZ1', amountKes: 2650 });
  });

  test('a cancelled callback has no receipt; anything else is ignored', () => {
    expect(parseStkCallback({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_2', ResultCode: 1032, ResultDesc: 'Request cancelled by user' } } })).toMatchObject({ resultCode: '1032', receipt: undefined });
    expect(parseStkCallback({ hello: 'world' })).toBeNull();
    expect(parseStkCallback(null)).toBeNull();
  });
});
