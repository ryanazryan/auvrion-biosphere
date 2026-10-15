export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-6xl flex-col px-6 py-8 sm:px-10 sm:py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-forest/15 pb-6">
        <p className="text-sm font-semibold tracking-wide">AUVRION BIOSPHERE</p>
        <p className="flex items-center gap-2 rounded-full border border-forest/20 px-3 py-1.5 text-xs font-medium">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-forest" />
          Under development
        </p>
      </header>

      <section aria-labelledby="project-title" className="grid flex-1 items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
        <div>
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-forest">
            Environmental Intelligence Web Platform
          </p>
          <h1 id="project-title" className="font-display text-5xl leading-[1.08] tracking-tight sm:text-7xl">
            Auvrion<br />Biosphere
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink/80 sm:text-xl">
            Understanding our environment.<br className="hidden sm:block" />{" "}
            Supporting thoughtful human decisions.
          </p>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/75">
            We are developing a platform to connect biodiversity conservation,
            environmental observations, and human review. The application is not
            yet operational.
          </p>
          <a className="mt-8 inline-flex items-center gap-3 rounded-sm border-b border-forest pb-2 font-semibold text-forest focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-forest" href="#about">
            About the project <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div aria-hidden="true" className="relative flex aspect-square max-h-96 items-center justify-center overflow-hidden rounded-full border border-forest/15 bg-forest/5">
          <div className="absolute inset-8 rounded-full border border-forest/15" />
          <div className="absolute inset-16 rounded-full border border-forest/15" />
          <svg className="relative h-3/5 w-3/5 text-forest" viewBox="0 0 200 200" fill="none">
            <path d="M42 147C30 93 68 42 154 36C165 116 124 164 66 158" fill="currentColor" fillOpacity="0.12" />
            <path d="M42 147C30 93 68 42 154 36C165 116 124 164 66 158M39 167L144 48M69 131L63 94M91 106L88 69M114 80L146 83M91 106L131 116" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      <section id="about" aria-labelledby="about-title" className="grid gap-6 border-t border-forest/15 py-8 sm:grid-cols-[1fr_2fr]">
        <h2 id="about-title" className="text-sm font-semibold text-forest">A foundation for understanding</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-ink/75">
          Auvrion Biosphere is a prototype by Team Pais Patin for UINIC 8.0 Web
          Development 2026. Development is ongoing. Monitoring workflows and
          integrations will be introduced only after their technical and security
          decisions have been reviewed.
        </p>
      </section>

      <footer className="flex flex-wrap justify-between gap-3 border-t border-forest/15 pt-6 text-xs text-ink/70">
        <p>Team Pais Patin</p>
        <p>Biodiversity · Environment · Human judgment</p>
      </footer>
    </main>
  );
}
