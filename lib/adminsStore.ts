import type { AdminDirectory } from '@/lib/admins';
import { getServiceClient } from '@/lib/supabase/server';

export function supabaseAdminDirectory(): AdminDirectory {
  const db = () => getServiceClient();
  return {
    async list() {
      const { data, error } = await db().from('profiles').select('id').eq('is_admin', true);
      if (error) throw new Error(error.message);
      return Promise.all(
        (data ?? []).map(async ({ id }) => {
          const { data: u } = await db().auth.admin.getUserById(id as string);
          return { id: id as string, email: u.user?.email ?? null };
        }),
      );
    },
    async findUserByEmail(email) {
      const { data, error } = await db().rpc('user_id_by_email', { p_email: email });
      if (error) throw new Error(error.message);
      return (data as string | null) ?? null;
    },
    async setAdmin(userId, admin) {
      const { error } = await db().from('profiles').upsert({ id: userId, is_admin: admin });
      if (error) throw new Error(error.message);
    },
  };
}
