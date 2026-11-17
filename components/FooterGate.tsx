'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Renders its children everywhere except under /admin. */
export function FooterGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path?.startsWith('/admin') ? null : <>{children}</>;
}
