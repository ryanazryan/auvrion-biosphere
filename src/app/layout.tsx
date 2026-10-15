import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auvrion Biosphere — Environmental Intelligence",
  description:
    "An environmental intelligence web platform under development, connecting biodiversity conservation, environmental observations, and human decision-making.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
