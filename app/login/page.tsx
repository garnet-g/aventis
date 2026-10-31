'use client';

import { useState } from 'react';
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border p-3"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border p-3"
        />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="rounded bg-black p-3 font-semibold text-white disabled:opacity-50">
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>
      <button className="text-sm underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </main>
  );
}
