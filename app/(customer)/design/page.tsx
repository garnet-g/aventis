import { requireUser } from '@/lib/auth';
import { DesignWorkbench } from '@/components/DesignWorkbench';

export default async function DesignPage() {
  await requireUser();
  return <DesignWorkbench />;
}
