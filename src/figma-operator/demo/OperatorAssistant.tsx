"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { AuvrionAIBrand } from "@/components/branding/AuvrionAIBrand";
import * as I from "@/figma-operator/components/icons";
import {
  CopilotVisual,
  type CopilotVisualData,
} from "@/figma-operator/components/operator/CopilotVisual";
import { useOperator } from "@/figma-operator/operator-context";
import {
  LISTEN_DEMO_ROUTE,
  markListenRead,
  useListenPreview,
} from "./listen-store";

type AIContext = "overview" | "listen" | "observation" | "environment";
type OpenDetail = {
  context: AIContext;
  observationId?: string;
  facts?: { label: string; value: string }[];
  autoPrompt?: string;
};
const EVENT = "auvrion.operator.ai.open";

/** Open a context-aware UI preview. Never sends real data to an LLM. */
export function openOperatorAssistant(
  context: AIContext = "overview",
  observationId?: string,
  facts?: OpenDetail["facts"],
  autoPrompt?: string,
) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<OpenDetail>(EVENT, {
        detail: { context, observationId, facts, autoPrompt },
      }),
    );
  }
}

const SUGGESTIONS = [
  { label: "Jelaskan observasi ini", context: "observation" },
  { label: "Analisis data BMKG & NASA", context: "environment" },
  { label: "Jelaskan hasil audio", context: "listen" },
  { label: "Ringkas konteks", context: "overview" },
] as const;
const cls =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand";

function Bell({ className = "size-5" }: { className?: string }) {
  return <I.Bell className={className} />;
}

function formatWita(value?: string) {
  if (!value) return "";
  if (!value.includes("T")) return value;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** Header actions rendered before the organization name. Preview data stays isolated in listen-store. */
export function OperatorAssistControls() {
  const { operator: OPERATOR } = useOperator();
  const path = usePathname();
  const listen = useListenPreview();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [messages, setMessages] = useState<
    {
      id: number;
      query: string;
      context: AIContext;
      facts?: OpenDetail["facts"];
      answer?: string;
      state?: "loading" | "ready" | "error";
      sources?: { name: string; url: string }[];
      visual?: CopilotVisualData | null;
    }[]
  >([]);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<OpenDetail>({ context: "overview" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const inferred: OpenDetail =
    path === LISTEN_DEMO_ROUTE
      ? { context: "listen", observationId: "demo-listen-01" }
      : path.includes("/observations/")
        ? { context: "observation" }
        : path.includes("/map")
          ? { context: "environment" }
          : { context: "overview" };

  function openSheet(value: OpenDetail, trigger?: HTMLElement | null) {
    lastTrigger.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    setDetail(value);
    setVisible(true);
  }
  function closeSheet() {
    if (!visible || closing) return;
    setClosing(true);
    closingTimer.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      closingTimer.current = null;
    }, 180);
  }
  // WC-024: Auvrion Luna environmental service. Other contexts remain honest preview states.
  const askQuestion = useCallback(
    (
      value: string,
      context: AIContext,
      facts?: OpenDetail["facts"],
      observationId?: string,
    ) => {
      const identityQuestion =
        /^(?:siapa (?:kamu|anda)|(?:apa|siapa) nama(?:mu| kamu| anda)|nama kamu siapa|perkenalkan diri(?:mu| anda)?|who are you|what is your name)\??[!.\s]*$/i.test(
          value.trim(),
        );
      const id = Date.now() + Math.random();
      setMessages((prev) => [
        ...prev,
        {
          id,
          query: value,
          context,
          facts,
          state: identityQuestion ? "ready" : "loading",
          answer: identityQuestion
            ? "Saya Auvrion AI, asisten analisis lingkungan Auvrion Biosphere. Saya membantu menjelaskan data yang tersedia; keputusan operasional tetap berada pada manusia."
            : undefined,
        },
      ]);
      if (identityQuestion) return;
      void (async () => {
        try {
          const response = await fetch(
            `/api/operator/copilot/analyze?organizationId=${encodeURIComponent(OPERATOR.organizationId)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question: value, context, observationId }),
            },
          );
          if (!response.ok) {
            const messages: Record<number, string> = {
              403: "Akses atau MFA tidak berlaku. Silakan login/verifikasi ulang.",
              404: "Observasi tidak ditemukan dalam organisasi Anda.",
              422: "Wilayah belum dikonfigurasi. Minta administrator memvalidasi ADM4 dan area FIRMS.",
              429: "Batas analisis tercapai. Silakan coba nanti.",
              503: "Sumber data atau layanan AI sedang tidak tersedia.",
            };
            throw new Error(
              messages[response.status] ?? "Analisis belum dapat dilakukan.",
            );
          }
          const data: unknown = await response.json();
          if (
            !data ||
            typeof data !== "object" ||
            !("answer" in data) ||
            typeof data.answer !== "string"
          )
            throw new Error("INVALID_ANSWER");
          const answer = data.answer;
          const visual =
            "visual" in data &&
            data.visual &&
            typeof data.visual === "object" &&
            "kind" in data.visual &&
            typeof data.visual.kind === "string" &&
            ["environment", "observation", "overview", "species"].includes(
              data.visual.kind,
            )
              ? (data.visual as CopilotVisualData)
              : null;
          const sources =
            "sources" in data && Array.isArray(data.sources)
              ? (data.sources as { name: string; url: string }[]).filter(
                  (s) =>
                    s &&
                    typeof s.name === "string" &&
                    typeof s.url === "string" &&
                    (s.url === "https://data.bmkg.go.id/prakiraan-cuaca/" ||
                      s.url ===
                        "https://firms.modaps.eosdis.nasa.gov/api/area" ||
                      s.url === "https://www.gbif.org/" ||
                      s.url === "https://www.inaturalist.org/"),
                )
              : [];
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? { ...m, answer, state: "ready", sources, visual }
                : m,
            ),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Analisis belum dapat dilakukan.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, state: "error", answer: message } : m,
            ),
          );
        }
      })();
    },
    [OPERATOR.organizationId],
  );

  useEffect(
    () => () => {
      if (closingTimer.current) clearTimeout(closingTimer.current);
    },
    [],
  );
  useEffect(() => {
    const onOpen = (event: Event) => {
      const value = (event as CustomEvent<OpenDetail>).detail;
      lastTrigger.current = document.activeElement as HTMLElement | null;
      setDetail(value ?? { context: "overview" });
      setVisible(true);
      if (value?.autoPrompt) {
        askQuestion(
          value.autoPrompt,
          value.context,
          value.facts,
          value.observationId,
        );
      }
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, [askQuestion]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    } else if (!visible && dialog.open) {
      dialog.close();
      lastTrigger.current?.focus();
    }
  }, [visible]);
  useEffect(() => {
    if (!notificationOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!noticeRef.current?.contains(event.target as Node))
        setNotificationOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [notificationOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    askQuestion(value, detail.context, detail.facts, detail.observationId);
    setQuery("");
  }
  function suggested(label: string, context: AIContext) {
    setDetail((old) => ({ ...old, context }));
    askQuestion(label, context, detail.facts, detail.observationId);
  }
  const currentContext = detail.observationId
    ? `Observasi ${detail.observationId}`
    : detail.context === "listen"
      ? "Audio LISTEN"
      : detail.context === "environment"
        ? "Lingkungan"
        : detail.context === "observation"
          ? "Observasi"
          : "Ringkasan";
  const isListenReady =
    listen.step === "candidate" || listen.step === "notified";

  return (
    <>
      <button
        type="button"
        className={`${cls} h-8 shrink-0 px-2.5`}
        onClick={(e) => openSheet(inferred, e.currentTarget)}
        aria-haspopup="dialog"
        aria-label="Buka Auvrion AI"
      >
        <span aria-hidden="true" className="block size-4">
          <AuvrionAIBrand />
        </span>
        <span className="hidden sm:inline">Auvrion AI</span>
      </button>
      <div ref={noticeRef} className="relative shrink-0">
        <button
          type="button"
          className="relative grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-bg hover:text-fg"
          aria-label={`Notifikasi${listen.unread > 0 ? `, ${listen.unread} belum dibaca` : ""}`}
          aria-expanded={notificationOpen}
          onClick={() => {
            setNotificationOpen((v) => !v);
            markListenRead();
          }}
        >
          <Bell className="size-4.5" />
          {listen.unread > 0 && (
            <span className="absolute right-0 top-0 grid size-4 place-items-center rounded-full bg-brand text-[10px] text-white">
              {listen.unread}
            </span>
          )}
        </button>
        {notificationOpen && (
          <section
            aria-label="Notifikasi"
            className="absolute right-0 z-50 mt-2 w-[min(350px,calc(100vw-32px))] overflow-hidden rounded-lg border border-line bg-white shadow-[0_10px_30px_-10px_rgb(20_45_37/0.25)]"
          >
            <header className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
              <h2 className="text-sm font-semibold">Notifikasi</h2>
              {listen.notices.length > 0 && (
                <span className="text-[11px] text-warn">Demo LISTEN</span>
              )}
            </header>
            {listen.notices.length === 0 ? (
              <p className="px-4 py-7 text-center text-[13px] text-muted">
                Belum ada notifikasi
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-line overflow-y-auto">
                {listen.notices.map((item) => (
                  <li key={item.id} className="flex gap-3 px-3.5 py-3">
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full ${item.level === "warn" ? "bg-warn-50 text-warn" : "bg-brand-50 text-brand"}`}
                    >
                      <span aria-hidden="true" className="block size-3.5">
                        <AuvrionAIBrand />
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium">{item.label}</p>
                        <time className="shrink-0 text-xs text-muted">
                          {formatWita(item.at)} WITA
                        </time>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        LISTEN-01 · Data simulasi
                      </p>
                      <Link
                        href={LISTEN_DEMO_ROUTE}
                        onClick={() => setNotificationOpen(false)}
                        className="mt-1.5 inline-block text-xs font-medium text-brand hover:underline"
                      >
                        Lihat observasi
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      <dialog
        ref={dialogRef}
        data-closing={closing || undefined}
        onCancel={(event) => {
          event.preventDefault();
          closeSheet();
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) closeSheet();
        }}
        onClose={() => setVisible(false)}
        aria-label="Auvrion AI"
        className="auvrion-ai-dialog fixed inset-y-0 right-0 left-auto m-0 ml-auto h-dvh max-h-dvh w-full max-w-110 flex-col border-l border-line bg-white p-0 text-fg shadow-xl backdrop:bg-ink/30 sm:w-105"
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex items-start gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="min-w-0">
                <AuvrionAIBrand variant="wordmark" />
              </h2>
              <p className="mt-2 truncate text-xs text-muted">
                Konteks:{" "}
                <span className="rounded bg-brand-50 px-1.5 py-px font-medium text-brand">
                  {currentContext}
                </span>
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={closeSheet}
              aria-label="Tutup Auvrion AI"
              className="grid size-9 place-items-center rounded-md text-muted hover:bg-bg"
            >
              <I.X className="size-5" />
            </button>
          </header>
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand">
                  <span aria-hidden="true" className="block size-5">
                    <AuvrionAIBrand />
                  </span>
                </span>
                <p className="mt-3 text-sm font-medium">Auvrion AI</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {messages.map((msg) => (
                  <li key={msg.id} className="space-y-3">
                    <p className="ml-auto max-w-[90%] rounded-lg bg-brand px-3.5 py-2.5 text-[13px] leading-5 text-white">
                      {msg.query}
                    </p>
                    <div className="flex items-start gap-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
                        <span aria-hidden="true" className="block size-3.5">
                          <AuvrionAIBrand />
                        </span>
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-5">
                        <p className="mb-2 font-semibold">
                          {msg.state === "loading"
                            ? "Menyiapkan analisis data yang diizinkan…"
                            : msg.state === "ready"
                              ? "Auvrion AI"
                              : msg.state === "error"
                                ? "Analisis belum tersedia"
                                : msg.context === "listen" && isListenReady
                                  ? "Pola suara perlu ditinjau"
                                  : "Analisis belum tersedia"}
                        </p>
                        {msg.answer ? (
                          <div className="min-w-0 wrap-break-word">
                            {msg.visual && <CopilotVisual data={msg.visual} />}
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => (
                                  <p className="mb-2 last:mb-0">{children}</p>
                                ),
                                strong: ({ children }) => (
                                  <strong className="font-semibold">
                                    {children}
                                  </strong>
                                ),
                                ul: ({ children }) => (
                                  <ul className="mb-2 list-disc space-y-1 pl-5">
                                    {children}
                                  </ul>
                                ),
                                ol: ({ children }) => (
                                  <ol className="mb-2 list-decimal space-y-1 pl-5">
                                    {children}
                                  </ol>
                                ),
                                a: ({ href, children }) =>
                                  href ===
                                    "https://data.bmkg.go.id/prakiraan-cuaca/" ||
                                  href ===
                                    "https://firms.modaps.eosdis.nasa.gov/api/area" ? (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-brand underline"
                                    >
                                      {children}
                                    </a>
                                  ) : (
                                    <span>{children}</span>
                                  ),
                              }}
                            >
                              {msg.answer}
                            </ReactMarkdown>
                          </div>
                        ) : msg.state === "loading" ? (
                          <p className="text-muted">
                            Menganalisis sumber yang tersedia…
                          </p>
                        ) : msg.state === "error" ? (
                          <p className="text-muted">
                            Data atau layanan AI belum tersedia. Coba lagi
                            setelah konfigurasi sumber dan API key diperiksa.
                          </p>
                        ) : msg.facts && msg.facts.length > 0 ? (
                          <dl className="divide-y divide-line rounded border border-line bg-white">
                            {msg.facts.map((fact) => (
                              <div
                                key={fact.label}
                                className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 p-2"
                              >
                                <dt className="text-muted">{fact.label}</dt>
                                <dd className="min-w-0 wrap-break-word">
                                  {fact.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="text-muted">
                            {msg.context === "listen" && isListenReady
                              ? "Kandidat demo: vokalisasi burung. Skor 0,62 bukan probabilitas terkalibrasi; belum diverifikasi manusia."
                              : "Layanan AI belum terhubung. Informasi belum dapat disimpulkan otomatis."}
                          </p>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            {msg.sources.map((source) => (
                              <li key={source.url}>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-brand underline"
                                >
                                  {source.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-xs text-muted">
                          {msg.context === "environment"
                            ? "BMKG/NASA FIRMS memerlukan data resmi dan waktu sumber. Deteksi termal bukan konfirmasi kebakaran."
                            : "Keputusan tetap harus ditinjau manusia."}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <footer className="border-t border-line px-4 pb-[calc(0.75rem+var(--safe-bottom))] pt-3">
            <fieldset className="-mx-4 mb-2 flex min-w-0 gap-1.5 overflow-x-auto border-0 px-4 pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
              <legend className="sr-only">Pertanyaan yang disarankan</legend>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => suggested(s.label, s.context)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line bg-bg px-2.5 py-1 text-xs text-fg/85 transition-colors hover:border-brand/40 hover:bg-brand-50"
                >
                  {s.label}
                </button>
              ))}
            </fieldset>
            <form onSubmit={submit} className="flex items-center gap-2">
              <label htmlFor="auvrion-ai-message" className="sr-only">
                Pertanyaan Auvrion AI
              </label>
              <input
                id="auvrion-ai-message"
                value={query}
                maxLength={200}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tulis pertanyaan..."
                className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-white px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                aria-label="Kirim"
                className="grid size-9 shrink-0 place-items-center rounded-md bg-brand text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
              >
                ➤
              </button>
            </form>
          </footer>
        </div>
      </dialog>
    </>
  );
}
