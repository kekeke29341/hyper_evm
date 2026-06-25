import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Hyperpool | Managed LP on HyperEVM",
  description: "Hyperpool — managed LP on HyperEVM, daily USDC Cashdrop rewards, and cross-chain deposit via Li.FI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
