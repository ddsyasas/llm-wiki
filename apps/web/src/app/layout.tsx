import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Wiki",
  description: "Local-first knowledge base maintained by an LLM agent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
