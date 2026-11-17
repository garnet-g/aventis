import { redirect } from 'next/navigation';

// Paying is done for the whole cart now (see /checkout). Old links and bookmarks land in the cart.
export const metadata = { title: 'Checkout' };

export default function LegacyCheckoutPage() {
  redirect('/cart');
}
