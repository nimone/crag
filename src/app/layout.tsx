import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
