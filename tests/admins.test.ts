import { describe, expect, test } from 'vitest';
import { addAdmin, removeAdmin, type AdminDirectory } from '@/lib/admins';

function directory() {
  const users = new Map([['a1', 'boss@vybecrew.co.ke'], ['u2', 'wanjiku@example.com']]);
  const admins = new Set(['a1']);
  const dir: AdminDirectory = {
    list: async () => [...admins].map((id) => ({ id, email: users.get(id) ?? null })),
    findUserByEmail: async (email) => [...users].find(([, e]) => e === email)?.[0] ?? null,
    setAdmin: async (id, admin) => void (admin ? admins.add(id) : admins.delete(id)),
  };
  return { dir, admins };
}

describe('managing admins', () => {
  test('adds an existing account by email, whatever the case', async () => {
    const { dir, admins } = directory();
    await addAdmin(dir, '  Wanjiku@Example.com ');
    expect(admins.has('u2')).toBe(true);
  });

  test('refuses unknown emails and nonsense', async () => {
    const { dir } = directory();
    await expect(addAdmin(dir, 'nobody@example.com')).rejects.toMatchObject({ status: 404 });
    await expect(addAdmin(dir, 'not an email')).rejects.toMatchObject({ status: 400 });
  });

  test('removes another admin, never yourself', async () => {
    const { dir, admins } = directory();
    await addAdmin(dir, 'wanjiku@example.com');
    await expect(removeAdmin(dir, 'a1', 'a1')).rejects.toMatchObject({ status: 400 });
    await removeAdmin(dir, 'a1', 'u2');
    expect([...admins]).toEqual(['a1']);
    await expect(removeAdmin(dir, 'a1', 'u2')).rejects.toMatchObject({ status: 404 });
  });
});
