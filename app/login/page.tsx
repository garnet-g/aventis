'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { authErrorMessage, safeNextPath } from '@/lib/authFlow';
import { getBrowserClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'reset';

const HEADINGS: Record<Mode, { eyebrow: string; title: string; button: string }> = {
  signin: { eyebrow: 'Welcome back', title: 'Sign in', button: 'Sign in' },
  signup: { eyebrow: 'New here', title: 'Create account', button: 'Sign up' },
  reset: { eyebrow: 'Forgot your password?', title: 'Reset password', button: 'Send reset link' },
};

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell flex max-w-lg flex-col gap-5 py-12">
        {/* useSearchParams needs a Suspense boundary so the rest of the page can be prerendered. */}
        <Suspense fallback={<p className="text-sm text-mute">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const linkFailed = params.get('error') === 'link';
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'reset' ? 'reset' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function switchTo(m: Mode) {
    setMode(m);
    setError('');
    setNotice('');
  }

  // After the emailed link is opened, the callback signs the person in and sends them on to `then`.
  const callbackUrl = (then: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(then)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const supabase = getBrowserClient();

    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl('/reset-password') });
      setBusy(false);
      // Same message whether or not the email has an account, so the form can't be used to find out who is registered.
      if (error && error.code !== 'user_not_found') return setError(authErrorMessage(error));
      return setNotice(`If ${email} has an account, a link to set a new password is on its way. Open it on this device.`);
    }

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl(next ?? '/design') } });
      if (error) {
        setBusy(false);
        return setError(authErrorMessage(error));
      }
      if (!data.session) {
        // Email confirmation is on: there is no session until the link is opened.
        setBusy(false);
        return setNotice(`Almost done: open the link we sent to ${email} to confirm your account.`);
      }
      router.replace(next ?? '/design');
      return router.refresh();
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return setError(authErrorMessage(error));
    }
    // Back to where they were; otherwise admins land in the admin area and everyone else starts designing.
    let destination = next ?? '/design';
    if (!next) {
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', data.user.id).maybeSingle();
      if (profile?.is_admin) destination = '/admin/orders';
    }
    router.replace(destination);
    router.refresh();
  }

  const h = HEADINGS[mode];
  return (
    <>
      <div>
        <p className="eyebrow">{next && mode !== 'reset' ? 'Sign in to continue' : h.eyebrow}</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">{h.title}</h1>
        {mode === 'reset' && <p className="mt-2 text-sm text-mute">Enter the email you signed up with and we will send you a link to choose a new password.</p>}
      </div>
      {linkFailed && (
        <p role="alert" className="ticket text-sm font-semibold">
          That link has expired or was already used. Request a new one below.
        </p>
      )}
      <form onSubmit={submit} className="ticket flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-bold" htmlFor="login-email">
          Email
          <input id="login-email" type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="field font-normal" />
        </label>
        {mode !== 'reset' && (
          <label className="flex flex-col gap-1 text-sm font-bold" htmlFor="login-password">
            Password
            <input
              id="login-password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="Password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field font-normal"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-vermilion">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm font-semibold text-forest">
            {notice}
          </p>
        )}
        <button disabled={busy} className="btn mt-1">
          {busy ? 'Please wait…' : h.button}
        </button>
        {mode === 'signin' && (
          <button type="button" className="self-start text-sm underline" onClick={() => switchTo('reset')}>
            Forgot password?
          </button>
        )}
      </form>
      {mode === 'signin' && (
        <button className="text-sm underline" onClick={() => switchTo('signup')}>
          New here? Create an account
        </button>
      )}
      {mode !== 'signin' && (
        <button className="text-sm underline" onClick={() => switchTo('signin')}>
          Have an account? Sign in
        </button>
      )}
    </>
  );
}
