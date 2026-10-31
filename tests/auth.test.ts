import { beforeEach, describe, expect, test, vi } from 'vitest';

let currentUser: { id: string } | null = null;
let isAdmin = false;

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }),
  getServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: isAdmin } }) }) }) }),
  }),
}));

import { apiUser, requireAdmin, requireUser } from '@/lib/auth';

beforeEach(() => {
  currentUser = null;
  isAdmin = false;
});

describe('auth gates', () => {
  test('requireUser rejects anonymous', async () => {
    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
  });

  test('requireUser returns the signed-in user', async () => {
    currentUser = { id: 'u1' };
    await expect(requireUser()).resolves.toEqual({ id: 'u1' });
  });

  test('requireAdmin rejects a non-admin user', async () => {
    currentUser = { id: 'u1' };
    await expect(requireAdmin()).rejects.toThrow('NOT_FOUND');
  });

  test('requireAdmin rejects anonymous by sending them to sign in', async () => {
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/login');
  });

  test('apiUser returns null for anonymous instead of redirecting (API routes answer 401)', async () => {
    await expect(apiUser()).resolves.toBeNull();
  });

  test('apiUser returns the signed-in user', async () => {
    currentUser = { id: 'u1' };
    await expect(apiUser()).resolves.toEqual({ id: 'u1' });
  });

  test('requireAdmin accepts an admin', async () => {
    currentUser = { id: 'a1' };
    isAdmin = true;
    await expect(requireAdmin()).resolves.toEqual({ id: 'a1' });
  });
});
