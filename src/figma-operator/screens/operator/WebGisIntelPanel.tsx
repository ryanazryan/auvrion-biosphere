"use client";

import { useEffect, useState } from "react";
import { IslandSelector } from "@/components/gis/IslandSelector";
import {
  ISLAND_REGIONS,
  type IslandRegion,
  islandBounds,
  islandHotspots,
} from "@/components/gis/island-regions";
import { SelectMenu } from "@/components/ui/SelectMenu";
import type {
  HotspotPoint,
  HotspotsPayload,
} from "@/figma-operator/gis/hotspots";

type Region = HotspotsPayload["regionId"];
type WindowDays = HotspotsPayload["days"];
const PERIOD_OPTIONS = [
  { value: "1", label: "1 hari" },
  { value: "2", label: "2 hari" },
  { value: "5", label: "5 hari" },
] as const;
export function WebGisIntelPanel({
  organizationId,
  enabled,
  onFeatures,
  onBounds,
}: {
  organizationId: string;
  enabled: boolean;
  onFeatures: (features: HotspotPoint[]) => void;
  onBounds: (bbox: [number, number, number, number] | null) => void;
}) {
  // Closing the controls must never turn the satellite layer off.
  const [hotspotLayerVisible, setHotspotLayerVisible] = useState(true);
  const [hotspotPanelOpen, setHotspotPanelOpen] = useState(false);

  const [island, setIsland] = useState<IslandRegion>("kalimantan");
  const regionId: Region = island;
  const [days, setDays] = useState<WindowDays>(2);
  const [hotspotRetry, setHotspotRetry] = useState(0);
  const [result, setResult] = useState<HotspotsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void hotspotRetry; // Intentionally force refetch when Retry is clicked.
    if (!enabled || !hotspotLayerVisible) {
      setResult(null);
      onFeatures([]);
      onBounds(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setError("");
    setAnswer("");
    onFeatures([]);
    onBounds(null);
    const qs = new URLSearchParams({
      organizationId,
      regionId,
      days: String(days),
    });
    fetch(`/api/gis/hotspots?${qs}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`NASA FIRMS HTTP ${response.status}`);
        return (await response.json()) as HotspotsPayload;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (
          data.regionId !== regionId ||
          data.days !== days ||
          !Array.isArray(data.features)
        )
          throw new Error("INVALID_HOTSPOT_PAYLOAD");
        setResult(data);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Deteksi NASA FIRMS belum dapat dimuat.",
        );
        onFeatures([]);
        onBounds(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    organizationId,
    regionId,
    days,
    hotspotRetry,
    hotspotLayerVisible,
    enabled,
    onFeatures,
    onBounds,
  ]);

  useEffect(() => {
    // Reassert island focus after loading, clearing or replacing a response.
    void hotspotLayerVisible;
    void result;
    void error;
    onBounds(islandBounds(island));
  }, [island, hotspotLayerVisible, result, error, onBounds]);

  useEffect(() => {
    onFeatures(
      hotspotLayerVisible && result
        ? islandHotspots(result.features, island)
        : [],
    );
  }, [hotspotLayerVisible, result, island, onFeatures]);

  const visibleHotspotCount = result
    ? islandHotspots(result.features, island).length
    : 0;

  async function askWebGis() {
    if (!result || asking || question.trim().length < 3) return;
    setAsking(true);
    setAnswer("");
    setAnswerError("");
    try {
      const url = `/api/operator/copilot/webgis/analyze?organizationId=${encodeURIComponent(organizationId)}`;
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), regionId, days }),
      });
      if (!response.ok) throw new Error("UNAVAILABLE");
      const data = (await response.json()) as { answer?: unknown };
      if (typeof data.answer !== "string") throw new Error("INVALID_RESULT");
      setAnswer(data.answer);
    } catch {
      setAnswerError("Analisis belum tersedia untuk data ini.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      {hotspotPanelOpen ? (
        <aside
          aria-label="Lapisan NASA FIRMS dan Auvrion AI"
          className="absolute left-3 top-3 z-20 w-[min(310px,calc(100%-6rem))] max-md:w-[min(310px,calc(100%-5.5rem))] max-md:max-h-[min(55dvh,390px)] max-md:overflow-y-auto rounded-lg border border-line bg-white/95 p-3 shadow-md backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="webgis-hotspot-toggle"
              className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink"
            >
              <input
                id="webgis-hotspot-toggle"
                type="checkbox"
                disabled={!enabled}
                checked={hotspotLayerVisible && enabled}
                onChange={(event) =>
                  setHotspotLayerVisible(event.target.checked)
                }
                className="accent-[#20785f]"
              />
              Hotspot satelit
            </label>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="rounded px-2 py-1 text-xs text-brand hover:bg-bg"
            >
              {expanded ? "Ringkas" : "Analisis AI"}
            </button>
            <button
              type="button"
              title="Tutup panel hotspot"
              aria-label="Tutup panel hotspot"
              onClick={() => setHotspotPanelOpen(false)}
              className="flex size-7 items-center justify-center rounded text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M5 5 19 19M19 5 5 19" />
              </svg>
            </button>
          </div>
          {!enabled ? (
            <p className="mt-2 text-xs text-muted">
              Aktifkan basemap resmi untuk melihat titik satelit.
            </p>
          ) : hotspotLayerVisible ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <span className="mb-1 block text-[11px] text-muted">
                    Fokus pulau
                  </span>
                  <IslandSelector value={island} onChange={setIsland} />
                </div>
                <div className="flex min-w-0 flex-col gap-1 text-[11px] text-muted">
                  <span>Sumber data</span>
                  <span className="flex min-h-9 items-center truncate rounded border border-line bg-bg px-2 text-xs font-semibold text-ink">
                    {ISLAND_REGIONS[island].label}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-[11px] text-muted">
                    Periode
                  </span>

                  <SelectMenu
                    label="Periode hotspot"
                    value={String(days)}
                    options={PERIOD_OPTIONS}
                    onChange={(value) => {
                      setDays(Number(value) as WindowDays);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-fg" aria-live="polite">
                {loading
                  ? "Memuat NASA FIRMS…"
                  : error ||
                    (result
                      ? `${result.count} deteksi termal · ${result.sensor}`
                      : "—")}
              </div>
              {error && (
                <div className="mt-1 text-xs text-danger" role="alert">
                  <p>{error}. Coba periode lebih singkat atau wilayah lain.</p>
                  <button
                    type="button"
                    className="mt-1 underline"
                    onClick={() => setHotspotRetry((value) => value + 1)}
                  >
                    Coba lagi
                  </button>
                </div>
              )}
              {result && hotspotLayerVisible && (
                <p
                  className="mt-1 text-[11px] font-medium text-ink"
                  aria-live="polite"
                  data-testid="operator-hotspot-island-count"
                >
                  {visibleHotspotCount.toLocaleString("id-ID")} titik di pulau
                  terpilih.
                </p>
              )}
              {result?.truncated && (
                <p className="mt-1 text-xs text-warn">
                  Hasil dibatasi 25.000 titik.
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted">
                FRP mengukur radiasi termal (MW). Pilih titik untuk detail;
                verifikasi lapangan diperlukan.
              </p>
              {expanded && (
                <div className="mt-3 space-y-2 border-t border-line pt-3">
                  <label
                    htmlFor="webgis-question"
                    className="block text-xs font-medium text-fg"
                  >
                    Tanya Auvrion AI tentang data peta
                  </label>
                  <textarea
                    id="webgis-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    maxLength={450}
                    rows={2}
                    placeholder="Apa arti deteksi pada wilayah ini?"
                    className="w-full resize-y rounded border border-line bg-white px-2 py-1.5 text-xs text-fg"
                  />
                  <button
                    type="button"
                    disabled={!result || asking || question.trim().length < 3}
                    onClick={() => void askWebGis()}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {asking ? "Menganalisis…" : "Tanya Auvrion AI"}
                  </button>
                  {answerError && (
                    <p role="alert" className="text-xs text-danger">
                      {answerError}
                    </p>
                  )}
                  {answer && (
                    <div
                      aria-live="polite"
                      className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-bg p-2 text-xs leading-5 text-fg"
                    >
                      {answer}
                    </div>
                  )}
                  <p className="text-[11px] text-muted">
                    AI hanya membaca deteksi pada wilayah/periode terpilih dan
                    statistik observasi organisasi.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </aside>
      ) : (
        <button
          type="button"
          aria-label="Buka panel hotspot satelit"
          aria-expanded={false}
          onClick={() => setHotspotPanelOpen(true)}
          className="absolute left-3 top-3 z-20 inline-flex items-center gap-2 rounded-lg border border-line bg-white/95 px-3 py-2 text-xs font-medium text-ink shadow-sm backdrop-blur-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Hotspot satelit
          <span
            className={
              hotspotLayerVisible && enabled ? "text-brand" : "text-muted"
            }
          >
            {hotspotLayerVisible && enabled ? "Aktif" : "Nonaktif"}
          </span>
        </button>
      )}
    </>
  );
}
