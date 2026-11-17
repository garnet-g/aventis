'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, json, send } from '@/lib/clientFetch';

/** The list of admins, with add-by-email and remove. */
export function AdminsManager({ admins, meId }: { admins: { id: string; email: string | null }[]; meId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function call(path: string, init: RequestInit) {
    setBusy(true);
    setError('');
    const r = await send(path, init);
    setBusy(false);
    if (!r.ok) return setError(errorText(r, 'That did not work.')), false;
    router.refresh();
    return true;
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <ul className="flex flex-col divide-y divide-ink/20 rounded-lg border-2 border-ink">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm" data-testid="admin-row">
            <span>
              {a.email ?? a.id}
              {a.id === meId && <span className="ml-2 text-xs text-mute">(you)</span>}
            </span>
            {a.id !== meId && (
              <button
                disabled={busy}
                className="btn btn-quiet btn-sm border-vermilion text-vermilion"
                onClick={() => confirm(`Remove admin rights from ${a.email ?? 'this account'}?`) && void call(`/api/admin/admins/${a.id}`, { method: 'DELETE' })}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call('/api/admin/admins', json('POST', { email }))) setEmail('');
        }}
      >
        <label className="flex flex-1 flex-col gap-1 text-sm font-bold">
          Add an admin by email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" className="field font-normal" />
        </label>
        <button disabled={busy} className="btn btn-ink btn-sm">
          Add admin
        </button>
      </form>
      <p className="text-xs text-mute">They need an account first: ask them to sign up on the site, then add them here. Admins can see every order and customer upload.</p>
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
    </div>
  );
}
