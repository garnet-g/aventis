import type { ReactNode } from 'react';

const TEE = 'M300 120 Q400 190 500 120 L690 200 L750 380 L640 410 L620 360 L620 900 L180 900 L180 360 L160 410 L50 380 L110 200 Z';

/** A flat T-shirt illustration; children are drawn on the chest in an 800x1000 coordinate space. */
export function TeeArt({ fill = '#f4ecdd', className, children }: { fill?: string; className?: string; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 800 1000" className={className} aria-hidden>
      <path d={TEE} fill={fill} stroke="#16120f" strokeWidth={12} strokeLinejoin="round" />
      <path d="M300 120 Q400 190 500 120" fill="none" stroke="#16120f" strokeWidth={12} />
      {children}
    </svg>
  );
}
