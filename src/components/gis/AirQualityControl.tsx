"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AirQualityPayload,
  AirQualitySite,
} from "@/server/gis/air-quality-contract";

type Point = {
  latitude: number;
  longitude: number;
};

const EMPTY: AirQualitySite[] = [];

const AQI_LEVELS = [
  { range: "0–50", label: "Baik", color: "#2b8a57" },
  { range: "51–100", label: "Sedang", color: "#c49c19" },
  { range: "101–150", label: "Sensitif", color: "#ed8435" },
  { range: "151–200", label: "Tidak sehat", color: "#d34a4a" },
  { range: "201–300", label: "Sangat tidak sehat", color: "#8f3f97" },
  { range: "301+", label: "Berbahaya", color: "#7e0023" },
] as const;

export function AirQualityControl({
  organizationId,
  enabled,
  selectedPoint,
  onSites,
}: {
  organizationId: string;
  enabled: boolean;
  selectedPoint: Point | null;
  onSites: (sites: AirQualitySite[]) => void;
}) {
  const [visible, setVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
  const panelDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    minDx: number;
    maxDx: number;
    minDy: number;
    maxDy: number;
  } | null>(null);

  const [sites, setSites] = useState<AirQualitySite[]>(EMPTY);
  const [pointSite, setPointSite] = useState<AirQualitySite | null>(null);
  const [pointState, setPointState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const latestPinRequest = useRef(0);

  useEffect(() => {
    if (!visible || !enabled) {
      setSites(EMPTY);
      return;
    }

    const abort = new AbortController();

    setLoading(true);
    setError(false);

    const qs = new URLSearchParams({ organizationId });

    fetch(`/api/gis/air-quality?${qs}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: abort.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("UNAVAILABLE");
        }

        return response.json() as Promise<AirQualityPayload>;
      })
      .then((value) => {
        if (abort.signal.aborted) return;

        setSites(Array.isArray(value.sites) ? value.sites : EMPTY);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError(true);
          setSites(EMPTY);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      });

    return () => abort.abort();
  }, [organizationId, enabled, visible]);

  const pinScope = `${organizationId}:${selectedPoint?.latitude ?? "none"}:${selectedPoint?.longitude ?? "none"}`;
  const previousPinScope = useRef(pinScope);

  useEffect(() => {
    if (previousPinScope.current === pinScope) return;

    previousPinScope.current = pinScope;
    latestPinRequest.current += 1;

    setPointSite(null);
    setPointState("idle");
  }, [pinScope]);

  useEffect(() => {
    onSites(
      enabled && visible ? (pointSite ? [...sites, pointSite] : sites) : EMPTY,
    );
  }, [enabled, visible, sites, pointSite, onSites]);

  async function inspectPin() {
    if (!selectedPoint || !enabled || pointState === "loading") {
      return;
    }

    const requestId = ++latestPinRequest.current;

    setPointState("loading");
    setPointSite(null);

    const qs = new URLSearchParams({
      organizationId,
      latitude: selectedPoint.latitude.toFixed(5),
      longitude: selectedPoint.longitude.toFixed(5),
    });

    try {
      const response = await fetch(`/api/gis/air-quality?${qs}`, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("UNAVAILABLE");
      }

      const value = (await response.json()) as AirQualityPayload;

      const site = value.sites[0];

      if (!site) {
        throw new Error("NO_MODEL_DATA");
      }

      if (requestId !== latestPinRequest.current) return;

      setPointSite(site);
      setPointState("idle");
    } catch {
      if (requestId === latestPinRequest.current) {
        setPointState("error");
      }
    }
  }

  const locationCount = sites.filter((site) => site.usAqi !== null).length;

  function startPanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const element = panelRef.current;
    const bounds = element?.offsetParent?.getBoundingClientRect();
    const rect = element?.getBoundingClientRect();
    if (!rect || !bounds) return;
    panelDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panelPosition.x,
      originY: panelPosition.y,
      minDx: bounds.left + 8 - rect.left,
      maxDx: bounds.right - 8 - rect.right,
      minDy: bounds.top + 8 - rect.top,
      maxDy: bounds.bottom - 8 - rect.bottom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = panelDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, value));
    setPanelPosition({
      x:
        drag.originX +
        clamp(event.clientX - drag.startX, drag.minDx, drag.maxDx),
      y:
        drag.originY +
        clamp(event.clientY - drag.startY, drag.minDy, drag.maxDy),
    });
  }

  function endPanelDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (panelDrag.current?.pointerId !== event.pointerId) return;
    panelDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  // AB-WC-011-PIN-AQI-UX-20261028: draggable, compact-on-demand, source-accurate panel.
  return (
    <>
      {!panelOpen ? (
        <button
          type="button"
          aria-label="Buka detail kualitas udara"
          title="US AQI"
          aria-expanded={false}
          onClick={() => setPanelOpen(true)}
          className="pointer-events-auto absolute bottom-[5.5rem] left-3 z-20 grid size-11 place-items-center rounded-lg border border-line-strong bg-white/95 text-ink shadow-md backdrop-blur-sm transition-colors hover:border-brand/50 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand max-md:bottom-[10rem]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="size-5"
          >
            <path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h7a3 3 0 1 1-3 3" />
          </svg>
        </button>
      ) : (
        <aside
          ref={panelRef}
          aria-label="Detail kualitas udara US AQI"
          className="pointer-events-auto absolute bottom-[5.5rem] left-3 z-30 flex w-[min(370px,calc(100%-2rem))] max-h-[min(70dvh,530px)] flex-col overflow-hidden rounded-xl border border-line bg-white/95 shadow-xl backdrop-blur-sm max-md:bottom-[10rem] max-md:max-h-[min(60dvh,500px)]"
          style={{
            transform: `translate(${panelPosition.x}px, ${panelPosition.y}px)`,
          }}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-line px-2.5 py-2">
            <button
              type="button"
              aria-label="Geser panel kualitas udara"
              title="Geser panel"
              onPointerDown={startPanelDrag}
              onPointerMove={movePanelDrag}
              onPointerUp={endPanelDrag}
              onPointerCancel={endPanelDrag}
              className="flex min-h-9 min-w-0 flex-1 touch-none items-center gap-2 rounded-lg px-2 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="size-4 text-muted"
              >
                <path
                  d="M8 5h.01M8 10h.01M8 15h.01M13 5h.01M13 10h.01M13 15h.01"
                  strokeWidth="3"
                />
              </svg>
              <span>US AQI</span>
            </button>
            <label
              className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted"
              title="Tampilkan kualitas udara di peta"
            >
              <input
                type="checkbox"
                checked={visible && enabled}
                disabled={!enabled}
                onChange={(event) => setVisible(event.target.checked)}
                className="accent-brand"
              />
              Layer
            </label>
            <button
              type="button"
              aria-label="Minimalkan panel kualitas udara"
              title="Minimalkan"
              onClick={() => setPanelOpen(false)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="size-4"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3 text-xs text-fg">
            <div role="status" aria-live="polite" className="font-medium">
              {!enabled
                ? "Peta belum tersedia"
                : loading
                  ? "Memuat kualitas udara…"
                  : error
                    ? "Data US AQI tidak tersedia"
                    : !visible
                      ? "Layer tidak aktif"
                      : locationCount === 0
                        ? "Data US AQI tidak tersedia"
                        : `${locationCount} lokasi US AQI`}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3">
              {AQI_LEVELS.map((level) => (
                <div
                  key={level.range}
                  className="flex min-w-0 items-start gap-2"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: level.color }}
                  />
                  <div className="min-w-0">
                    <span className="font-semibold tabular-nums">
                      {level.range}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {level.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {selectedPoint && (
              <div className="rounded-lg border border-line p-3">
                <div className="font-semibold text-ink">Lokasi dipilih</div>
                {pointSite ? (
                  pointSite.usAqi === null ? (
                    <p className="mt-2 text-muted">
                      Data US AQI tidak tersedia
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1">
                      <p className="font-semibold text-ink">
                        US AQI: {pointSite.usAqi}
                      </p>
                      {pointSite.pm25 !== null && (
                        <p className="text-muted">
                          PM2.5: {pointSite.pm25} µg/m³
                        </p>
                      )}
                      {pointSite.pm10 !== null && (
                        <p className="text-muted">
                          PM10: {pointSite.pm10} µg/m³
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={pointState === "loading" || !enabled}
                    onClick={() => void inspectPin()}
                    className="mt-2 rounded-md border border-line px-3 py-1.5 font-medium text-brand transition-colors hover:bg-bg disabled:opacity-50"
                  >
                    {pointState === "loading" ? "Memuat…" : "Lihat data lokasi"}
                  </button>
                )}
                {pointState === "error" && (
                  <p role="alert" className="mt-2 text-muted">
                    Data US AQI tidak tersedia
                  </p>
                )}
              </div>
            )}
            <a
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-[11px] font-medium text-brand hover:underline"
            >
              Open-Meteo
            </a>
          </div>
        </aside>
      )}
    </>
  );
}
