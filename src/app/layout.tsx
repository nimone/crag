import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Corrective RAG — Self-correcting AI over SEC Filings",
  description:
    "A production-grade Corrective RAG (CRAG) system that grades its own retrieval, self-corrects with web-search fallback, and streams answers over SEC filings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans antialiased bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
