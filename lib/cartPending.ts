'use client';

import { useSyncExternalStore } from 'react';

/**
 * How many cart changes (quantity taps) are still on their way to the server. Checkout waits for them, so the total
 * on the next page is never missing the tap made just before.
 */
let pending = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const cartPending = {
  start() {
    pending++;
    notify();
  },
  done() {
    pending = Math.max(0, pending - 1);
    notify();
  },
};

export function useCartPending(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending > 0,
    () => false,
  );
}
