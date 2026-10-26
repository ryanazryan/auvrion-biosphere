import Image from "next/image";
import type { ReactNode } from "react";
import { SidebarBrandImage } from "@/components/branding/SidebarBrandImage";

type WordmarkProps = {
  inverted?: boolean;
};

type AuthLayoutProps = {
  children: ReactNode;
};

type AuthHeaderProps = {
  title: string;
  children?: ReactNode;
};

export function Wordmark({ inverted = false }: WordmarkProps) {
  return (
    <Image
      src={
        inverted
          ? "/branding/auvrion-biosphere-wordmark-inverted.png"
          : "/branding/auvrion-biosphere-wordmark.png"
      }
      alt="Auvrion Biosphere"
      width={196}
      height={52}
      className="h-8 w-auto max-w-[146px] object-contain"
    />
  );
}

function Contours() {
  const rings = [60, 100, 140, 185, 235, 290, 350, 415];

  return (
    <svg
      className="pointer-events-none absolute -right-40 -bottom-40 h-180 w-180 text-white/[0.07]"
      viewBox="0 0 900 900"
      aria-hidden="true"
    >
      {rings.map((radius, index) => (
        <ellipse
          key={radius}
          cx={450 + index * 6}
          cy={450 - index * 4}
          rx={radius * 1.08}
          ry={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          transform={`rotate(${-18 + index * 3} 450 450)`}
        />
      ))}
    </svg>
  );
}

/**
 * Auvrion Biosphere Authentication Layout
 *
 * Visual baseline:
 * - Figma Make Authentication Experience V3
 *
 * Responsive behavior:
 * - Mobile: single-column layout with safe-area support
 * - Desktop: split-screen layout with environmental branding
 *
 * Security boundary:
 * - Presentation only
 * - No authentication or authorization logic
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh min-w-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Desktop branding panel */}
      <aside className="relative hidden overflow-hidden bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:flex-col lg:justify-between lg:p-10 xl:p-12">
        <Contours />
        <div className="relative max-w-lg">
          <p className="text-[17px] font-medium text-[#8fc9b2]">
            Platform AIoT &amp; WebGIS
          </p>

          <div className="mt-14">
            <Image
              src="/branding/auvrion-biosphere-wordmark-white.png"
              alt="Auvrion Biosphere"
              width={520}
              height={220}
              priority
              className="h-auto w-full max-w-[520px] object-contain"
            />
          </div>
        </div>
      </aside>

      {/* Authentication content panel */}
      <main
        className="
          flex min-w-0 flex-col
          px-[calc(1.25rem+var(--safe-left,0px))]
          pr-[calc(1.25rem+var(--safe-right,0px))]
          pt-[calc(1rem+var(--safe-top,0px))]
          pb-[calc(1.5rem+var(--safe-bottom,0px))]
          sm:px-8
          lg:px-12
          lg:py-6
          lg:h-dvh
          lg:overflow-y-auto
          lg:overscroll-contain
        "
      >
        {/* Mobile branding header */}
        <header className="flex min-w-0 shrink-0 pt-2 pb-4 lg:hidden">
          <SidebarBrandImage />
        </header>

        {/* Main authentication form */}
        <div className="flex min-w-0 flex-1 items-center justify-center py-10">
          <div className="w-full min-w-0 max-w-100">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function AuthHeader({ title, children }: AuthHeaderProps) {
  return (
    <header className="mb-7">
      <h1 className="text-2xl font-semibold tracking-[-0.015em] text-fg">
        {title}
      </h1>

      {children ? (
        <p className="mt-2 text-sm leading-6 text-muted">{children}</p>
      ) : null}
    </header>
  );
}
