'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorText, json, send } from '@/lib/clientFetch';
import { getBrowserClient } from '@/lib/supabase/client';

/** Sets a new password for the signed-in customer. */
export function ChangePassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        const { error } = await getBrowserClient().auth.updateUser({ password });
        setBusy(false);
        if (error) return setMessage({ ok: false, text: error.message });
        setPassword('');
        setMessage({ ok: true, text: 'Password changed.' });
      }}
    >
      <label className="flex flex-1 flex-col gap-1 text-sm font-bold">
        New password
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="field font-normal" />
      </label>
      <button disabled={busy} className="btn btn-ink btn-sm">
        {busy ? 'Saving…' : 'Change password'}
      </button>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`w-full text-sm font-semibold ${message.ok ? 'text-forest' : 'text-vermilion'}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}

/** Deletes the account after the customer types DELETE, then signs them out. */
export function DeleteAccount({ hasOrders }: { hasOrders: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const r = await send('/api/account', json('DELETE', { confirm }));
        if (!r.ok) {
          setBusy(false);
          return setError(errorText(r, 'Could not delete your account.'));
        }
        await getBrowserClient().auth.signOut({ scope: 'local' });
        router.replace('/?account=deleted');
        router.refresh();
      }}
    >
      <p className="text-sm">
        {hasOrders
          ? 'Your login, saved designs and uploads are deleted. Paid orders are kept for five years, as Kenyan tax law requires, then deleted.'
          : 'Your login, designs, uploads and cart are deleted for good.'}{' '}
        This cannot be undone.
      </p>
      <label className="flex flex-col gap-1 text-sm font-bold">
        Type DELETE to confirm
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="field max-w-48 font-normal" />
      </label>
      <button disabled={busy || confirm.trim().toUpperCase() !== 'DELETE'} className="btn btn-sm self-start border-vermilion bg-vermilion text-white disabled:opacity-40">
        {busy ? 'Deleting…' : 'Delete my account'}
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-vermilion">
          {error}
        </p>
      )}
    </form>
  );
}
