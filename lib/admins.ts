import { HttpError } from '@/lib/errors';

export interface AdminDirectory {
  /** Everyone with admin rights. */
  list(): Promise<{ id: string; email: string | null }[]>;
  findUserByEmail(email: string): Promise<string | null>;
  setAdmin(userId: string, admin: boolean): Promise<void>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Gives an existing account admin rights. The person must have signed up first. */
export async function addAdmin(dir: AdminDirectory, email: unknown) {
  const clean = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL.test(clean)) throw new HttpError(400, 'Enter an email address.');
  const id = await dir.findUserByEmail(clean);
  if (!id) throw new HttpError(404, 'No account uses that email. Ask them to sign up first, then add them.');
  await dir.setAdmin(id, true);
  return id;
}

/** Takes admin rights away. Nobody can remove themselves, so there is always at least one admin left. */
export async function removeAdmin(dir: AdminDirectory, actingAdminId: string, userId: string) {
  if (userId === actingAdminId) throw new HttpError(400, 'You cannot remove yourself. Ask another admin.');
  const admins = await dir.list();
  if (!admins.some((a) => a.id === userId)) throw new HttpError(404, 'That person is not an admin.');
  await dir.setAdmin(userId, false);
}
