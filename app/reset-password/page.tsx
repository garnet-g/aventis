'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { authErrorMessage } from '@/lib/authFlow';
import { getBrowserClient } from '@/lib/supabase/client';

/** Reached from the password-reset email (via /auth/callback, which has already signed the person in). */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords are different. Type the same one twice.');
    setBusy(true);
    setError('');
    const supabase = getBrowserClient();
    const { data: who } = await supabase.auth.getUser();
    if (!who.user) {
      setBusy(false);
      return setExpired(true);
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(authErrorMessage(error));
    }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', who.user.id).maybeSingle();
    router.replace(profile?.is_admin ? '/admin/orders' : '/design');
    router.refresh();
  }

  return (
    <>
      <SiteHeader />
      <main className="shell flex max-w-lg flex-col gap-5 py-12">
        <div>
          <p className="eyebrow">Almost there</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Choose a new password</h1>
        </div>
        {expired ? (
          <p role="alert" className="ticket text-sm font-semibold">
            This reset link has expired or was opened on another device.{' '}
            <Link className="underline" href="/login?mode=reset">
              Request a new link
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={submit} className="ticket flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-bold" htmlFor="new-password">
              New password
              <input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="field font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold" htmlFor="confirm-password">
              Type it again
              <input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field font-normal" />
            </label>
            <p className="text-xs text-mute">At least 8 characters.</p>
            {error && (
              <p role="alert" className="text-sm font-semibold text-vermilion">
                {error}
              </p>
            )}
            <button disabled={busy} className="btn mt-1">
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
