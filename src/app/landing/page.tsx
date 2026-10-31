import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Auvrion Biosphere | Pemantauan Lingkungan & WebGIS",
  description:
    "Platform konservasi, IoT LISTEN dan PREVENT, serta WebGIS interaktif publik.",
};

export default function PublicLandingPage() {
  return <LandingPage />;
}
