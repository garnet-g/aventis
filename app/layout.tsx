import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import "@fontsource/noto-sans/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/pacifico/400.css";
import "@fontsource/noto-naskh-arabic/700.css";

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
  title: { default: "VybeCrew", template: "%s | VybeCrew" },
  description: "Shop VybeCrew drops or design your own shirt or hoodie. We print it and deliver it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrument.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}
        <SiteFooter />
      </body>
    </html>
  );
}
