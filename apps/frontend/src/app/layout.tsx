import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title:       "Reality Firewall v3 — DeFi Oracle Risk Intelligence",
  description: "Autonomous oracle attack detection powered by Chainlink CRE, x402 micropayments, ERC-8004 identity, and Claude AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
