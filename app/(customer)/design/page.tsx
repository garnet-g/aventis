import { requireUser } from '@/lib/auth';
import { DesignFlow } from '@/components/DesignFlow';

export default async function DesignPage() {
  await requireUser();
  return <DesignFlow />;
}
