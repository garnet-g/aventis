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
    setBusy(false);
    if (error) return setError(error.message);
    window.location.href = '/design';
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-12 pt-4">
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
