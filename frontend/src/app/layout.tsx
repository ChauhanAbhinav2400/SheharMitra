import { Baloo_2, Mukta } from "next/font/google";
import { headers } from "next/headers";
import type { Metadata } from "next";
import "./globals.css";
const heading = Baloo_2({
  subsets: ["latin", "devanagari"],
  weight: ["600", "700"],
  variable: "--font-heading",
  display: "swap",
});
const body = Mukta({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
export const metadata: Metadata = {
  applicationName: "शहर मित्र",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico", apple: "/brand/apple-touch-icon.png" },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const lang = (await headers()).get("x-sheharmitra-lang") || "hi";
  return (
    <html lang={lang} className={`${heading.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
