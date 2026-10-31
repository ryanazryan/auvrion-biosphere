"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const sections = [
  { label: "Tentang", href: "#tentang" },
  { label: "Solusi", href: "#solusi" },
  { label: "Teknologi", href: "#teknologi" },
  { label: "Dampak", href: "#dampak" },
  { label: "Sumber Daya", href: "#sumber-daya" },
];

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="ab-header">
      <nav className="ab-nav" aria-label="Navigasi utama">
        <Link
          href="/landing"
          className="ab-brand"
          aria-label="Auvrion Biosphere — Beranda"
        >
          <Image
            src="/branding/auvrion-biosphere-wordmark.png"
            alt="Auvrion Biosphere"
            width={230}
            height={65}
            priority
            className="ab-wordmark"
          />
        </Link>
        <div className="ab-nav-links">
          {sections.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </div>
        <div className="ab-nav-actions">
          <Link href="/login" className="ab-nav-login">
            Masuk
          </Link>
          <a className="ab-nav-primary" href="#webgis">
            Eksplorasi Demo <span aria-hidden="true">→</span>
          </a>
          <button
            type="button"
            className="ab-menu-button"
            aria-expanded={open}
            aria-controls="ab-mobile-navigation"
            aria-label={open ? "Tutup navigasi" : "Buka navigasi"}
            onClick={() => setOpen((value) => !value)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              aria-hidden="true"
            >
              <path
                d={open ? "M5 5 19 19M19 5 5 19" : "M3 7h18M3 12h18M3 17h18"}
              />
            </svg>
          </button>
        </div>
      </nav>
      {open && (
        <div className="ab-mobile-nav" id="ab-mobile-navigation">
          {sections.map((item) => (
            <a href={item.href} key={item.href} onClick={() => setOpen(false)}>
              {item.label}
            </a>
          ))}
          <Link href="/request-access" onClick={() => setOpen(false)}>
            Ajukan akses
          </Link>
        </div>
      )}
    </header>
  );
}
