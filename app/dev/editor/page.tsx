import { notFound } from 'next/navigation';
import { DesignWorkbench } from '@/components/DesignWorkbench';

// Development-only harness for the editor (no sign-in, local previews only).
export default function DevEditorPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DesignWorkbench showLayersJson />;
}
