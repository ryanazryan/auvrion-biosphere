"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SidebarBrandImage } from "@/components/branding/SidebarBrandImage";
import "./role-demo-v3.css";
import { SidebarToggleIcon } from "@/components/ui/SidebarToggleIcon";
import {
  type GuestRole,
  type GuestState,
  type GuestTab,
  INITIAL_STATE,
  NAVIGATION,
  ROLE_LABEL,
  readGuestState,
  STORAGE_KEY,
  TOURS,
} from "./role-demo-v3-data";
import { PRIMARY, SECONDARY } from "./role-demo-v3-ui";
import {
  OperatorPages,
  RangerPages,
  SupervisorPages,
} from "./role-demo-v3-views";

function MenuSymbol({ name }: { name: string }) {
  const marks: Record<string, ReactNode> = {
    "layout-dashboard": (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    "clipboard-list": (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4h6M9 10h6M9 14h6M9 18h4" />
      </>
    ),
    "plus-square": (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 7v10M7 12h10" />
      </>
    ),
    "list-checks": (
      <>
        <path d="m3 6 2 2 3-4M10 6h11m-18 7 2 2 3-4M10 13h11m-18 6 2 2 3-4M10 20h11" />
      </>
    ),
    "arrow-left-right": (
      <>
        <path d="M4 7h15l-4-4m4 4-4 4M20 17H5l4-4m-4 4 4 4" />
      </>
    ),
    "radio-tower": (
      <>
        <path d="M8 21h8M12 6l-3 15m3-15 3 15M7 5a7 7 0 0 0 0 9m10-9a7 7 0 0 1 0 9M4 2a11 11 0 0 0 0 15m16-15a11 11 0 0 1 0 15" />
      </>
    ),
    "audio-lines": (
      <>
        <path d="M3 12v1m4-6v11m4-15v18m4-14v11m4-11v11m3-7v3" />
      </>
    ),
    flame: (
      <path d="M12 22c5 0 8-3 8-8 0-4-2-7-5-10 0 4-2 5-3 6-1-2-2-5-2-8C5 7 4 10 4 14c0 5 3 8 8 8Z" />
    ),
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15M15 6v15" />
      </>
    ),
    "map-pin": (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    "file-text": (
      <>
        <path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8m-8 4h8" />
      </>
    ),
    "chart-column": (
      <>
        <path d="M3 3v18h18M7 17v-6h3v6m3 0V7h3v10m2 0v-4h2v4" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 4h16l2 11v5H2v-5zM2 15h6l2 3h4l2-3h6" />
      </>
    ),
    "clipboard-check": (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4h6m-6 9 2 2 4-4" />
      </>
    ),
    "user-round-plus": (
      <>
        <circle cx="10" cy="7" r="4" />
        <path d="M2 21v-2a8 8 0 0 1 16 0m0-10v8m-4-4h8" />
      </>
    ),
    route: (
      <>
        <circle cx="5" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
        <path d="M7 5h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h8" />
      </>
    ),
    house: (
      <>
        <path d="m3 11 9-8 9 8v10H3zM9 21v-7h6v7" />
      </>
    ),
    "notebook-pen": (
      <>
        <rect x="4" y="3" width="14" height="18" rx="2" />
        <path d="M8 8h5M8 12h5M15 19l6-6-3-3-6 6-1 4z" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l4 2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      {marks[name] ?? marks["layout-dashboard"]}
    </svg>
  );
}

type DemoMessage = {
  id: number;
  origin: "visitor" | "assistant";
  text: string;
};

function assistantResponse(question: string, state: GuestState): string {
  const q = question.toLowerCase();
  if (/burung|satwa|spesies|perch|bioakustik|audio|listen/.test(q)) {
    return state.aiAnalyzed
      ? "Rekaman LISTEN-01 memiliki kandidat Perch 2.0: merbah cerukcuk (82%), kacer (67%), dan tuwur asia (51%). Angka adalah skor contoh model; Operator tetap perlu meninjau kualitas audio dan verifikasi sebelum menyimpulkan spesies."
      : "Untuk menilai rekaman LISTEN, buka Alat IoT → LISTEN, pilih rekaman dan jalankan analisis Perch 2.0. Hasilnya akan memuat kandidat dan skor untuk peninjauan Operator.";
  }
  if (/prevent|asap|kebakaran|hotspot|suhu|pm2|risiko|lingkungan/.test(q)) {
    return `Skenario PREVENT saat ini: ${state.preventScenario}. Interpretasikan kombinasi suhu, kelembapan, partikulat dan konteks satelit secara bersama. Kondisi berisiko tidak boleh dinyatakan pasti tanpa pemeriksaan sumber dan verifikasi lapangan.`;
  }
  if (/case|supervisor|ranger|tugas|verifikasi|keputusan/.test(q)) {
    return `Status CASE-2401: ${state.caseStage}. Status TASK-2401: ${state.taskStage}. Alur penanganan: Operator melakukan review dan mengirim observasi → Supervisor menilai dan menugaskan Ranger → Ranger memeriksa di lapangan → Supervisor mengevaluasi hasil.`;
  }
  if (/ringkas|aktivitas|laporan|observasi/.test(q)) {
    return `Ada ${state.observations.length} observasi dalam sesi ini; ${state.observations.filter((item) => item.status === "forwarded").length} telah diteruskan. Aktivitas terakhir: ${state.events[0] ?? "Belum ada"}.`;
  }
  return "Saya dapat membantu membaca status observasi, hasil kandidat audio LISTEN, indikator PREVENT, serta alur Operator–Supervisor–Ranger. Pilih salah satu pertanyaan kontekstual untuk melanjutkan.";
}

function AIChat({ state, close }: { state: GuestState; close: () => void }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<DemoMessage[]>([
    {
      id: 0,
      origin: "assistant",
      text: "Selamat datang di Auvrion AI. Apa yang ingin Anda analisis?",
    },
  ]);
  const scroll = useRef<HTMLDivElement>(null);
  function send(value: string) {
    const question = value.trim().slice(0, 300);
    if (!question) return;
    setMessages((previous) => [
      ...previous,
      { id: previous.length * 2 + 1, origin: "visitor", text: question },
      {
        id: previous.length * 2 + 2,
        origin: "assistant",
        text: assistantResponse(question, state),
      },
    ]);
    setQuery("");
  }
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
  });
  return (
    <div className="fixed inset-0 z-[110] bg-black/35">
      <button
        type="button"
        aria-label="Tutup Auvrion AI"
        className="absolute inset-0"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Auvrion AI"
        className="absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-line bg-white shadow-2xl"
      >
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <div>
            <h2 className="text-base font-bold text-brand">Auvrion AI</h2>
            <p className="text-[11px] text-muted">
              Asisten analisis operasional
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup Auvrion AI"
            className={SECONDARY}
            onClick={close}
          >
            ×
          </button>
        </header>
        <div
          ref={scroll}
          className="flex-1 space-y-3 overflow-y-auto bg-[#f8faf8] p-4"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`w-fit max-w-[92%] rounded-xl border px-4 py-3 text-[13px] leading-6 ${message.origin === "visitor" ? "ml-auto border-brand bg-brand text-white" : "border-line bg-white text-ink"}`}
            >
              {message.text}
            </div>
          ))}
        </div>
        <div className="border-t border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              "Jelaskan hasil Perch 2.0",
              "Analisis risiko PREVENT",
              "Status Case dan Ranger",
            ].map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-brand hover:bg-brand-50"
                onClick={() => send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(query);
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-md border border-line-strong px-3 py-2 text-[13px]"
              aria-label="Pertanyaan kepada Auvrion AI"
              placeholder="Tanyakan kondisi lingkungan..."
              maxLength={300}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className={PRIMARY} disabled={!query.trim()}>
              Kirim
            </button>
          </form>
          <p className="mt-2 text-[11px] text-muted">
            Respons berbasis skenario interaktif; tidak memanggil layanan
            analisis produksi.
          </p>
        </div>
      </section>
    </div>
  );
}

function TourCard({
  role,
  index,
  next,
  previous,
  close,
}: {
  role: GuestRole;
  index: number;
  next: () => void;
  previous: () => void;
  close: () => void;
}) {
  const steps = TOURS[role];
  const current = steps[index];
  return (
    <aside
      role="dialog"
      aria-label="Panduan workspace"
      className="fixed right-3 bottom-4 left-3 z-[90] mx-auto max-w-[410px] rounded-xl border border-brand/30 bg-white p-4 shadow-[0_14px_50px_#153d3266] sm:left-auto sm:right-5 sm:bottom-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wider text-brand">
          PANDUAN {ROLE_LABEL[role].toUpperCase()} · {index + 1}/{steps.length}
        </span>
        <button
          type="button"
          onClick={close}
          className="text-xs font-medium text-muted hover:text-ink"
        >
          Lewati ×
        </button>
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>
      <h2 className="mt-3 text-[16px] font-semibold text-ink">
        {current.title}
      </h2>
      <p className="mt-2 text-[13px] leading-6 text-muted">{current.body}</p>
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className={SECONDARY}
          disabled={index === 0}
          onClick={previous}
        >
          ← Kembali
        </button>
        <button type="button" className={PRIMARY} onClick={next}>
          {index === steps.length - 1 ? "Selesai" : "Berikutnya →"}
        </button>
      </div>
    </aside>
  );
}

export function RoleDemoFidelity({ role }: { role: GuestRole }) {
  const [tab, setTab] = useState<GuestTab>("overview");
  const [data, setData] = useState<GuestState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setData(readGuestState(JSON.parse(raw) as unknown));
      const tourKey = `auvrion-guest-tour-seen-${role}`;
      if (!sessionStorage.getItem(tourKey)) {
        sessionStorage.setItem(tourKey, "1");
        setTourIndex(0);
      }
    } catch {
      /* Incognito storage may be blocked; in-memory state remains available. */
    }
    setHydrated(true);
  }, [role]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* Work without persistent session storage. */
    }
  }, [data, hydrated]);

  function navigate(next: GuestTab) {
    setTab(next);
    setDrawer(false);
  }
  function moveTour(index: number) {
    if (index < 0) return;
    if (index >= TOURS[role].length) {
      setTourIndex(null);
      return;
    }
    setTourIndex(index);
    navigate(TOURS[role][index].tab);
  }
  useEffect(() => {
    if (tourIndex === null) return;
    const current = TOURS[role][tourIndex];
    const element = document.querySelector(`[data-tour="${current.anchor}"]`);
    element?.setAttribute("data-tour-highlight", "true");
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    return () => {
      element?.removeAttribute("data-tour-highlight");
    };
  }, [role, tourIndex]);

  const currentLabel =
    NAVIGATION[role]
      .flatMap((group) => group.items)
      .find((item) => item.tab === tab)?.title ?? "Ringkasan";
  const menu = (closeOnClick: boolean) => (
    <nav
      aria-label={`Navigasi ${ROLE_LABEL[role]}`}
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4"
    >
      {NAVIGATION[role].map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-3 text-[11px] font-bold tracking-wider text-muted">
            {group.title}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.tab}>
                <button
                  type="button"
                  aria-current={tab === item.tab ? "page" : undefined}
                  className={`relative flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13px] font-medium transition-colors ${tab === item.tab ? "bg-brand-50 text-ink before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:bg-brand" : "text-muted hover:bg-bg hover:text-ink"}`}
                  onClick={() => {
                    navigate(item.tab);
                    if (closeOnClick) setDrawer(false);
                  }}
                >
                  <MenuSymbol name={item.icon} />
                  <span className="truncate">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="border-t border-line pt-4">
        <p className="mb-2 px-3 text-[11px] font-bold tracking-wider text-muted">
          PILIH PERAN
        </p>
        {(["operator", "supervisor", "ranger", "admin"] as const).map(
          (item) => (
            <Link
              key={item}
              onClick={() => setDrawer(false)}
              href={`/demo/${item}`}
              className={`block rounded-md px-3 py-2 text-xs ${item === role ? "bg-brand-50 font-semibold text-brand" : "text-muted hover:bg-bg"}`}
            >
              {item === "admin" ? "Admin / Organisasi" : ROLE_LABEL[item]}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
  const profile = (
    <div className="border-t border-line p-3">
      <div className="rounded-md bg-bg p-3 text-xs">
        <p className="text-[11px] uppercase tracking-wide text-muted">
          Organisasi
        </p>
        <p className="mt-1 font-medium text-ink">Auvrion Development</p>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px]">
        <span className="grid size-8 place-items-center rounded-full bg-brand-50 font-bold text-brand">
          {ROLE_LABEL[role][0]}
        </span>
        <span>{ROLE_LABEL[role]} Workspace</span>
      </div>
      <Link
        href="/landing#solusi"
        className="mt-3 block px-2 py-2 text-xs text-muted hover:text-brand"
      >
        ← Kembali ke beranda
      </Link>
    </div>
  );
  const viewProps = {
    tab,
    data,
    update: setData,
    navigate,
    openAI: () => setAiOpen(true),
  };
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-white transition-transform duration-200 lg:flex ${sidebarHidden ? "-translate-x-full" : "translate-x-0"}`}
      >
        <Link
          href="/landing#solusi"
          aria-label="Beranda Auvrion Biosphere"
          className="flex h-14 shrink-0 items-center border-b border-line px-4"
        >
          <SidebarBrandImage />
        </Link>
        {menu(false)}
        {profile}
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/40"
            aria-label="Tutup navigasi"
          />
          <aside className="relative flex h-dvh w-[280px] max-w-[85vw] flex-col border-r border-line bg-white">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <SidebarBrandImage />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="rounded-md border border-line px-3 py-1.5"
                aria-label="Tutup menu"
              >
                ×
              </button>
            </div>
            {menu(true)}
            {profile}
          </aside>
        </div>
      )}
      <div
        className={`transition-[padding] duration-200 ${sidebarHidden ? "lg:pl-0" : "lg:pl-[248px]"}`}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white px-3 sm:px-6">
          <button
            type="button"
            className="grid size-9 place-items-center text-muted lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Buka navigasi"
          >
            <SidebarToggleIcon open={false} />
          </button>
          <button
            type="button"
            className="hidden size-9 place-items-center text-muted lg:grid"
            onClick={() => setSidebarHidden((previous) => !previous)}
            aria-label={sidebarHidden ? "Buka sidebar" : "Tutup sidebar"}
          >
            <SidebarToggleIcon open={!sidebarHidden} />
          </button>
          <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
            {ROLE_LABEL[role]} <span className="mx-1 text-line-strong">/</span>
            <strong className="font-semibold text-ink">{currentLabel}</strong>
          </p>
          <button
            type="button"
            onClick={() => moveTour(0)}
            className="hidden rounded-md border border-brand/25 px-3 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand-50 sm:inline-flex"
          >
            Panduan
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="rounded-md bg-brand px-3 py-2 text-[12px] font-semibold text-white hover:bg-brand-hover"
          >
            Auvrion AI
          </button>
          <Link
            className="hidden text-[12px] text-muted hover:text-brand md:inline"
            href="/landing#solusi"
          >
            Semua peran
          </Link>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8 lg:pb-14">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-md border border-brand/15 bg-brand-50 px-2 py-1 text-[10px] font-bold tracking-wide text-brand">
              DEMO
            </span>
            <button
              type="button"
              onClick={() => moveTour(0)}
              className="text-xs font-semibold text-brand hover:underline sm:hidden"
            >
              Mulai panduan interaktif →
            </button>
          </div>
          {role === "operator" ? (
            <OperatorPages {...viewProps} />
          ) : role === "supervisor" ? (
            <SupervisorPages {...viewProps} />
          ) : (
            <RangerPages {...viewProps} />
          )}
          <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-4">
            <Link
              href="/landing#solusi"
              className="text-xs font-semibold text-brand hover:underline"
            >
              ← Pilih peran lain
            </Link>
            <button
              type="button"
              className="text-xs font-medium text-muted hover:text-brand"
              onClick={() => {
                setData(INITIAL_STATE);
                navigate("overview");
              }}
            >
              Atur ulang alur
            </button>
          </div>
        </main>
      </div>
      {role === "ranger" && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
          aria-label="Navigasi Ranger seluler"
        >
          {NAVIGATION.ranger[0].items.map((item) => (
            <button
              type="button"
              key={item.tab}
              onClick={() => navigate(item.tab)}
              aria-current={tab === item.tab ? "page" : undefined}
              className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[10px] ${tab === item.tab ? "text-brand" : "text-muted"}`}
            >
              <MenuSymbol name={item.icon} />
              <span className="truncate">
                {item.tab === "overview"
                  ? "Beranda"
                  : item.tab === "map"
                    ? "Peta"
                    : item.tab === "tasks"
                      ? "Tugas"
                      : item.tab === "findings"
                        ? "Temuan"
                        : "Riwayat"}
              </span>
            </button>
          ))}
        </nav>
      )}
      {aiOpen && <AIChat state={data} close={() => setAiOpen(false)} />}
      {tourIndex !== null && (
        <TourCard
          role={role}
          index={tourIndex}
          next={() => moveTour(tourIndex + 1)}
          previous={() => moveTour(tourIndex - 1)}
          close={() => setTourIndex(null)}
        />
      )}
    </div>
  );
}
