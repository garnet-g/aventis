import { connection } from 'next/server';
import { DEFAULT_PRICES, pricesFromStored, type PriceStore } from '@/lib/prices';
import { getServiceClient } from '@/lib/supabase/server';

/** Service-role store for the prices the owner edits. Customers only ever see them through the server. */
export function supabasePriceStore(): PriceStore {
  const db = () => getServiceClient();
  return {
    async get() {
      // Prices change whenever the owner saves them, so they are read for each request. Without this, Next.js reads
      // them while pre-building the page and cuts the request off when it finishes, which logged false errors.
      await connection();
      const { data, error } = await db().from('settings').select('value').eq('key', 'prices').maybeSingle();
      if (error) {
        // a Supabase error prints as {} in the browser overlay, so log its message (e.g. the database is still starting)
        console.error(`could not read prices, using the defaults: ${error.message || error.code || 'database unreachable'}`);
        return DEFAULT_PRICES;
      }
      return data ? pricesFromStored(data.value) : DEFAULT_PRICES;
    },
    async set(prices) {
      const { error } = await db().from('settings').upsert({ key: 'prices', value: prices, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}
