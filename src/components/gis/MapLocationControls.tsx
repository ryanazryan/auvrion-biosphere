"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MapNavigationTarget } from "./map-navigation";
import { isValidIndonesiaCoordinate } from "./map-navigation";

type Place = { id: string; label: string; latitude: number; longitude: number };

type SearchResponse = { results?: Place[]; error?: string };

/** Voluntary search and browser geolocation; no automatic device tracking. */
export function MapLocationControls({
  organizationId,
  onNavigate,
  iotLocationCount = 0,
}: {
  organizationId: string;
  onNavigate: (target: MapNavigationTarget | null) => void;
  /** Only counts verified and disclosure-approved locations from a trusted backend. */
  iotLocationCount?: number;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hasMapSearchPin, setHasMapSearchPin] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [iotOpen, setIotOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastRequest = useRef(0);
  const navId = useRef(0);
  const geolocationRequest = useRef(0);
  const suggestionsId = useId();

  useEffect(() => {
    if (panelOpen) searchInputRef.current?.focus();
  }, [panelOpen]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node))
        setSelectionOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    const seq = ++lastRequest.current;
    if (q.length < 3 || !selectionOpen) {
      setResults([]);
      setWorking(false);
      setError("");
      return;
    }
    const abort = new AbortController();
    setResults([]);
    const timer = window.setTimeout(() => {
      setWorking(true);
      setError("");
      const params = new URLSearchParams({ organizationId, q });
      void fetch(`/api/gis/location-search?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: abort.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              response.status === 429
                ? "Pencarian terlalu sering. Coba lagi sebentar."
                : "Layanan pencarian lokasi belum tersedia.",
            );
          return (await response.json()) as SearchResponse;
        })
        .then((payload) => {
          if (abort.signal.aborted || lastRequest.current !== seq) return;
          setResults(Array.isArray(payload.results) ? payload.results : []);
          setActiveIndex(-1);
        })
        .catch((cause: unknown) => {
          if (abort.signal.aborted || lastRequest.current !== seq) return;
          setResults([]);
          setError(
            cause instanceof Error ? cause.message : "Gagal mencari lokasi.",
          );
        })
        .finally(() => {
          if (!abort.signal.aborted && lastRequest.current === seq)
            setWorking(false);
        });
    }, 650);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [organizationId, query, selectionOpen]);

  function goTo(
    location: { label: string; latitude: number; longitude: number },
    kind: "search" | "device",
  ) {
    if (!isValidIndonesiaCoordinate(location.latitude, location.longitude)) {
      setError("Koordinat di luar cakupan Indonesia.");
      return;
    }
    onNavigate({ ...location, kind, request: ++navId.current });
    setHasMapSearchPin(true);
  }

  function selectPlace(place: Place) {
    goTo(place, "search");
    setQuery(place.label);
    setSelectionOpen(false);
    setResults([]);
    setError("");
  }

  // Explicitly clear the map marker, highlighted point, and pending suggestions.
  function clearMapSearch() {
    ++lastRequest.current;
    ++geolocationRequest.current;
    setLocating(false);
    setQuery("");
    setResults([]);
    setSelectionOpen(false);
    setActiveIndex(-1);
    setWorking(false);
    setError("");
    setLocationError("");
    setHasMapSearchPin(false);
    onNavigate(null);
  }

  function locateMe() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Browser ini tidak menyediakan layanan lokasi.");
      return;
    }
    if (!window.isSecureContext) {
      setLocationError(
        "Lokasi perangkat hanya tersedia melalui HTTPS atau localhost.",
      );
      return;
    }
    const locationRequest = ++geolocationRequest.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (locationRequest !== geolocationRequest.current) return;
        setLocating(false);
        if (!isValidIndonesiaCoordinate(coords.latitude, coords.longitude)) {
          setLocationError(
            "Lokasi perangkat berada di luar cakupan peta Indonesia.",
          );
          return;
        }
        goTo(
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
            label: "Posisi perangkat saat ini",
          },
          "device",
        );
      },
      (err) => {
        if (locationRequest !== geolocationRequest.current) return;
        setLocating(false);
        setLocationError(
          err.code === 1
            ? "Izin lokasi ditolak. Aktifkan izin lokasi di browser bila ingin menggunakannya."
            : err.code === 3
              ? "Permintaan lokasi habis waktu. Coba lagi."
              : "Lokasi perangkat belum bisa ditentukan.",
        );
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
  }

  // AB-WC-011-PIN-AQI-UX-20261028
  return (
    <section
      ref={root}
      aria-label="Navigasi peta"
      className={`pointer-events-auto absolute right-16 top-3 z-30 max-md:top-16 ${panelOpen ? "w-[min(350px,calc(100%-6rem))] max-md:w-[min(340px,calc(100%-6rem))]" : "w-auto"}`}
    >
      {!panelOpen ? (
        <div className="flex items-center gap-1.5">
          {hasMapSearchPin && (
            <button
              type="button"
              aria-label="Hapus pin lokasi"
              title="Hapus pin lokasi"
              onClick={clearMapSearch}
              className="grid size-10 place-items-center rounded-lg border border-line-strong bg-white/95 text-muted shadow-md hover:border-brand/50 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="size-4.5"
              >
                <path d="M5 5 19 19M19 5 5 19" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button
            type="button"
            aria-label="Buka pencarian lokasi"
            title="Cari lokasi"
            aria-expanded={false}
            onClick={() => setPanelOpen(true)}
            className="grid size-10 place-items-center rounded-lg border border-line-strong bg-white/95 text-ink shadow-md backdrop-blur-sm transition-colors hover:border-brand/50 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="size-4.5"
            >
              <circle cx="10.8" cy="10.8" r="6.8" />
              <path d="m16 16 4.5 4.5" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-white/95 p-2 shadow-md backdrop-blur-sm">
          <div className="relative">
            <label htmlFor={suggestionsId} className="sr-only">
              Cari lokasi
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="size-4 shrink-0 text-muted"
              >
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                ref={searchInputRef}
                id={suggestionsId}
                data-auvrion-focus-inner
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={selectionOpen && results.length > 0}
                aria-controls={`${suggestionsId}-options`}
                aria-activedescendant={
                  activeIndex >= 0 && selectionOpen
                    ? `${suggestionsId}-option-${activeIndex}`
                    : undefined
                }
                autoComplete="off"
                spellCheck={false}
                maxLength={75}
                placeholder="Cari lokasi…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectionOpen(true);
                }}
                onFocus={() => {
                  if (query.trim().length >= 3) setSelectionOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    if (selectionOpen) {
                      setSelectionOpen(false);
                      setActiveIndex(-1);
                    } else {
                      setPanelOpen(false);
                    }
                  }
                  if (event.key === "ArrowDown" && results.length > 0) {
                    event.preventDefault();
                    setSelectionOpen(true);
                    setActiveIndex((index) => (index + 1) % results.length);
                  }
                  if (event.key === "ArrowUp" && results.length > 0) {
                    event.preventDefault();
                    setSelectionOpen(true);
                    setActiveIndex((index) =>
                      index <= 0 ? results.length - 1 : index - 1,
                    );
                  }
                  if (
                    event.key === "Enter" &&
                    selectionOpen &&
                    results.length > 0
                  ) {
                    event.preventDefault();
                    selectPlace(results[activeIndex >= 0 ? activeIndex : 0]);
                  }
                }}
                className="h-10 w-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[13px] text-ink outline-none ring-0 placeholder:text-muted focus:outline-none focus-visible:outline-none focus:ring-0"
              />
              {working && (
                <span
                  role="status"
                  aria-label="Mencari"
                  className="text-xs text-muted"
                >
                  …
                </span>
              )}
              {(query.length > 0 || hasMapSearchPin) && (
                <button
                  type="button"
                  aria-label="Bersihkan pencarian dan hapus pin"
                  title="Bersihkan pencarian"
                  onClick={clearMapSearch}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-bg hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="size-4"
                  >
                    <path
                      d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <button
                type="button"
                aria-label="Tutup pencarian lokasi"
                title="Tutup"
                onClick={() => {
                  setPanelOpen(false);
                  setSelectionOpen(false);
                  setIotOpen(false);
                  setError("");
                  setLocationError("");
                }}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
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
                  <path d="M5 5 19 19M19 5 5 19" />
                </svg>
              </button>
            </div>
            {selectionOpen && results.length > 0 && (
              <div
                id={`${suggestionsId}-options`}
                role="listbox"
                aria-label="Saran lokasi"
                className="absolute right-0 left-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-line bg-white p-1 shadow-xl"
              >
                {results.map((place, index) => (
                  <button
                    key={place.id}
                    id={`${suggestionsId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    tabIndex={-1}
                    onClick={() => selectPlace(place)}
                    className={`block w-full rounded-md px-3 py-2 text-left text-xs leading-5 hover:bg-brand-50 ${activeIndex === index ? "bg-brand-50 text-brand" : "text-fg"}`}
                  >
                    {place.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 px-1 text-[11px] text-danger">
              {error}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={locating}
              onClick={locateMe}
              className="inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2 text-xs font-medium text-brand transition-colors hover:border-brand/40 hover:bg-bg disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="size-4"
              >
                <circle cx="12" cy="12" r="8" />
                <circle cx="12" cy="12" r="2" />
                <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
              </svg>
              {locating ? "Mencari…" : "Lokasi saya"}
            </button>
            <button
              type="button"
              aria-expanded={iotOpen}
              onClick={() => setIotOpen((open) => !open)}
              className="inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-2 text-xs font-medium text-fg transition-colors hover:border-brand/40 hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="size-4"
              >
                <rect x="4" y="6" width="16" height="12" rx="2" />
                <path d="M9 10h6M10 14h4M8 3V1M16 3V1" />
              </svg>
              IoT ({iotLocationCount})
            </button>
          </div>
          {locationError && (
            <p role="alert" className="mt-2 text-[11px] text-danger">
              {locationError}
            </p>
          )}
          {iotOpen && (
            <p
              className="mt-2 rounded-md bg-bg px-2.5 py-2 text-xs text-muted"
              role="status"
            >
              {iotLocationCount === 0
                ? "Belum ada lokasi IoT"
                : `${iotLocationCount} lokasi IoT di peta`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
