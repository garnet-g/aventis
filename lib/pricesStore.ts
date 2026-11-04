import { DEFAULT_PRICES, pricesFromStored, type PriceStore } from '@/lib/prices';
import { getServiceClient } from '@/lib/supabase/server';

/** Service-role store for the prices the owner edits. Customers only ever see them through the server. */
export function supabasePriceStore(): PriceStore {
  const db = () => getServiceClient();
  return {
    async get() {
      const { data, error } = await db().from('settings').select('value').eq('key', 'prices').maybeSingle();
      if (error) {
        console.error('could not read prices, using the defaults', error);
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
