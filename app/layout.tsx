import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "800"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // The public address, so share pictures and links point at the live site rather than localhost.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "VybeCrew", template: "%s | VybeCrew" },
  openGraph: { siteName: "VybeCrew", locale: "en_KE", type: "website" },
  description: "Shop VybeCrew drops or design your own shirt or hoodie. We print it and deliver it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-KE" className={`${bricolage.variable} ${instrument.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}
        <SiteFooter />
      </body>
    </html>
  );
}
