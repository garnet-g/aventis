import Link from 'next/link';
import { catalog, DELIVERY_FEE_PKR } from '@/lib/catalog';

const pkr = (n: number) => `PKR ${n.toLocaleString('en-PK')}`;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Put your design on a shirt or hoodie</h1>
        <p className="text-neutral-600">
          Upload your art or add your name, place it on the garment, and we print and deliver it.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3 text-sm">
        {Object.values(catalog).map((p) => (
          <li key={p.label} className="rounded border p-3">
            <p className="font-semibold">{p.label}</p>
            <p>{pkr(p.pricePkr)}</p>
            <p className="text-neutral-500">White or black · S to XL</p>
          </li>
        ))}
      </ul>
      <p className="-mt-3 text-xs text-neutral-500">Delivery {pkr(DELIVERY_FEE_PKR)}.</p>

      <div className="flex flex-col gap-3">
        <Link href="/design" className="rounded bg-orange-600 p-3 text-center font-semibold text-white">
          Start designing
        </Link>
        <div className="flex justify-between text-sm">
          <Link className="underline" href="/login">
            Sign in or create an account
          </Link>
          <Link className="underline" href="/orders">
            My designs and orders
          </Link>
        </div>
      </div>
    </main>
  );
}
