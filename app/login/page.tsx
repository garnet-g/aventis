'use client';

import { useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { getBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const supabase = getBrowserClient();
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    // Admins land in the admin area; everyone else starts designing. (A new account is never an admin.)
    let destination = '/design';
    if (mode === 'signin') {
      const { data: auth } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', auth.user?.id ?? '').maybeSingle();
      if (profile?.is_admin) destination = '/admin/orders';
    }
    window.location.href = destination;
  }

  return (
    <>
      <SiteHeader />
      <main className="shell flex max-w-lg flex-col gap-5 py-12">
        <div>
          <p className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'New here'}</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
        </div>
        <form onSubmit={submit} className="ticket flex flex-col gap-3">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
          {error && (
            <p role="alert" className="text-sm font-semibold text-vermilion">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn mt-1">
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <button className="text-sm underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </main>
    </>
  );
}
