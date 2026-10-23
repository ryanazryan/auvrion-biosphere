import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import type { ReactNode } from "react";
import { AssuranceExpiryMonitor } from "@/components/auth/AssuranceExpiryMonitor";

// One typography system for Authentication, Admin and Operator.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: "Auvrion Biosphere",
  description: "Environmental Intelligence Platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body className={montserrat.variable}>
        <AssuranceExpiryMonitor />
        {children}
      </body>
    </html>
  );
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
