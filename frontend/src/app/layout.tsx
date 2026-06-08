import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Project X | HyperEVM DEX",
  description: "HyperEVM ecosystem DEX — Swap, Liquidity, Points & Cross-chain Bridge",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className={`${geistSans.variable} antialiased min-h-screen cyber-bg`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
