import { FooterGate } from '@/components/FooterGate';
import { SiteFooter } from '@/components/SiteFooter';

/** The shop footer, left out of the admin area (which has its own navigation). */
export function FooterOutsideAdmin() {
  return (
    <FooterGate>
      <SiteFooter />
    </FooterGate>
  );
}
