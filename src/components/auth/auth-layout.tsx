import type { ReactNode } from "react";

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
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap min-[360px]:gap-2.5 ${
        inverted ? "text-white" : "text-ink"
      }`}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle
          cx="12"
          cy="12"
          r="10.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M12 4.5c-3.5 3-4.8 6.6-3.6 10.5M12 4.5c3.5 3 4.8 6.6 3.6 10.5M12 4.5v15"
          fill="none"
          stroke={inverted ? "#8fc9b2" : "#20785F"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <span className="text-[14px] font-semibold tracking-[-0.01em] min-[360px]:text-[15px]">
        Auvrion <span className="font-normal opacity-70">Biosphere</span>
      </span>
    </span>
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

        <div className="relative">
          <Wordmark inverted />
        </div>

        <div className="relative max-w-sm">
          <p className="text-[13px] font-medium text-[#8fc9b2]">
            Platform AIoT &amp; WebGIS
          </p>

          <p className="mt-3 text-2xl leading-snug font-semibold tracking-[-0.015em] text-white/95 xl:text-[28px] xl:leading-[1.35]">
            Pemantauan keanekaragaman hayati dan risiko kebakaran hutan, dengan
            keputusan akhir tetap di tangan manusia.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/12 pt-6 text-[13px]">
            {[
              ["IoT", "mengamati"],
              ["AI", "membantu"],
              ["Web", "mengorkestrasi"],
              ["Manusia", "memutuskan"],
            ].map(([term, meaning]) => (
              <div key={term}>
                <dt className="font-medium text-white">{term}</dt>
                <dd className="text-white/60">{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative text-xs text-white/45">
          Tim Pais Patin · UINIC 8.0 · 2026
        </p>
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
        <header className="flex h-14 min-w-0 shrink-0 items-center lg:hidden">
          <Wordmark />
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
