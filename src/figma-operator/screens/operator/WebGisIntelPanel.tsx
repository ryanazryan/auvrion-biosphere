"use client";

import { useEffect, useState } from "react";
import type {
  HotspotPoint,
  HotspotsPayload,
} from "@/figma-operator/gis/hotspots";

type Region = HotspotsPayload["regionId"];
type WindowDays = HotspotsPayload["days"];
const regions: { id: Region; title: string }[] = [
  { id: "kalimantan", title: "Kalimantan" },
  { id: "sulawesi", title: "Sulawesi" },
  { id: "bali", title: "Bali" },
];

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
  const [show, setShow] = useState(false);
  const [regionId, setRegionId] = useState<Region>("kalimantan");
  const [days, setDays] = useState<WindowDays>(1);
  const [result, setResult] = useState<HotspotsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!enabled || !show) {
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
        if (!response.ok)
          throw new Error(`NASA data unavailable (HTTP ${response.status})`);
        return (await response.json()) as HotspotsPayload;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(data);
        onFeatures(data.features);
        onBounds(data.bbox);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Deteksi NASA FIRMS belum dapat dimuat.");
        onFeatures([]);
        onBounds(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, regionId, days, show, enabled, onFeatures, onBounds]);

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
    <aside
      aria-label="Lapisan NASA FIRMS dan Auvrion AI"
      className="absolute left-3 top-3 z-20 w-[min(310px,calc(100%-6rem))] rounded-lg border border-line bg-white/95 p-3 shadow-md backdrop-blur-sm"
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
            checked={show && enabled}
            onChange={(event) => setShow(event.target.checked)}
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
      </div>
      {!enabled ? (
        <p className="mt-2 text-xs text-muted">
          Aktifkan basemap resmi untuk melihat titik satelit.
        </p>
      ) : show ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted">
              Wilayah
              <select
                aria-label="Wilayah hotspot"
                value={regionId}
                onChange={(event) => setRegionId(event.target.value as Region)}
                className="mt-1 block w-full rounded border border-line bg-white px-1.5 py-1.5 text-xs text-fg"
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Periode
              <select
                aria-label="Periode hotspot"
                value={days}
                onChange={(event) =>
                  setDays(Number(event.target.value) as WindowDays)
                }
                className="mt-1 block w-full rounded border border-line bg-white px-1.5 py-1.5 text-xs text-fg"
              >
                <option value={1}>1 hari</option>
                <option value={2}>2 hari</option>
                <option value={5}>5 hari</option>
              </select>
            </label>
          </div>
          <div className="mt-2 text-xs text-fg" aria-live="polite">
            {loading
              ? "Memuat NASA FIRMS…"
              : error ||
                (result
                  ? `${result.count} deteksi termal · ${result.sensor}`
                  : "—")}
          </div>
          {result?.truncated && (
            <p className="mt-1 text-xs text-warn">
              Hasil dibatasi 3.000 titik.
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted">
            Titik satelit bukan kebakaran terkonfirmasi. Area adalah bbox
            perkiraan.
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
  );
}
