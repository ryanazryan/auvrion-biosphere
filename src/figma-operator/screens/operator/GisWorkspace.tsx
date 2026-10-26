"use client";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AirQualityControl } from "@/components/gis/AirQualityControl";
import * as I from "@/figma-operator/components/icons";
import { OperatorLayout } from "@/figma-operator/components/operator/OperatorLayout";
import {
  approvedPoint,
  GisApiError,
  type GisFilter,
  type GisRecord,
  type GisResult,
  type GisZone,
  listGisObservations,
  listGisZones,
} from "@/figma-operator/gis/client";
import type { IndonesiaTimeZone } from "@/figma-operator/gis/format-time";
import type { HotspotPoint } from "@/figma-operator/gis/hotspots";
import {
  DOMAIN,
  type Domain,
  MODE,
  QUALITY,
  type Quality,
  type Source,
} from "@/figma-operator/observations";
import { useOperator } from "@/figma-operator/operator-context";
import { isoToZoneLocal, zoneLocalToIso } from "@/figma-operator/time";
import type { AirQualitySite } from "@/server/gis/air-quality-contract";
import {
  type GisDropdownOption,
  GisFilterDropdown,
  GisReceivedTimeDropdown,
} from "./GisFilterDropdown";
import { GisMapCanvas } from "./GisMapCanvas";
import { WebGisIntelPanel } from "./WebGisIntelPanel";

const INDONESIA_TIME_ZONES: Record<"WIB" | "WITA" | "WIT", IndonesiaTimeZone> =
  {
    WIB: "Asia/Jakarta",
    WITA: "Asia/Makassar",
    WIT: "Asia/Jayapura",
  };

const LIMIT = 50;
const EMPTY_ROWS: GisRecord[] = [];
type Filters = {
  domain: "" | Domain;
  sourceId: string;
  quality: "" | Quality;
  zoneId: string;
  from: string;
  to: string;
};
const empty: Filters = {
  domain: "",
  sourceId: "",
  quality: "",
  zoneId: "",
  from: "",
  to: "",
};

type QueryState<T> =
  | { status: "loading" }
  | { status: "success"; value: T }
  | { status: "error"; error: GisApiError };

function parseFilters(
  input: Pick<URLSearchParams, "get">,
  timeZone: "WIB" | "WITA" | "WIT",
): Filters {
  const d = input.get("domain");
  const quality = input.get("quality");
  const receivedFrom = input.get("receivedFrom");
  const receivedTo = input.get("receivedTo");
  return {
    domain: d === "biodiversity" || d === "environmental_risk" ? d : "",
    sourceId: input.get("sourceId") ?? "",
    quality:
      quality === "unreviewed" ||
      quality === "valid" ||
      quality === "suspect" ||
      quality === "invalid"
        ? quality
        : "",
    zoneId: input.get("zoneId") ?? "",
    from: receivedFrom ? isoToZoneLocal(receivedFrom, timeZone) : "",
    to: receivedTo ? isoToZoneLocal(receivedTo, timeZone) : "",
  };
}

function formatDate(value: string, zone: "WIB" | "WITA" | "WIT") {
  const timeZone = {
    WIB: "Asia/Jakarta",
    WITA: "Asia/Makassar",
    WIT: "Asia/Jayapura",
  }[zone];
  return new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    hour12: false,
  });
}

function LocationText({ row }: { row: GisRecord }) {
  if (approvedPoint(row)) return <span className="text-brand">Di peta</span>;
  if (row.location.hasCoordinates)
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <I.Lock className="size-3.5" /> Ditahan
      </span>
    );
  return <span className="text-muted">Lokasi tidak diketahui</span>;
}

export function GisWorkspace() {
  const { operator, sources, timeZone } = useOperator();
  const search = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() =>
    parseFilters(search, timeZone),
  );
  const [page, setPage] = useState(() =>
    Math.max(1, Number(search.get("page")) || 1),
  );
  const [view, setView] = useState<"map" | "table">("map");
  // Figma mobile uses two exclusive screens inside Map: Peta and Daftar.
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compactFiltersOpen, setCompactFiltersOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{
    id: string;
    request: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hotspots, setHotspots] = useState<HotspotPoint[]>([]);
  const [airQualitySites, setAirQualitySites] = useState<AirQualitySite[]>([]);
  const [pickedMapLocation, setPickedMapLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [hotspotBounds, setHotspotBounds] = useState<
    [number, number, number, number] | null
  >(null);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<QueryState<GisResult>>({
    status: "loading",
  });
  const [zones, setZones] = useState<QueryState<GisZone[]>>({
    status: "loading",
  });

  const params = useMemo<GisFilter>(
    () => ({
      organizationId: operator.organizationId,
      ...(filters.domain ? { domain: filters.domain } : {}),
      ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
      ...(filters.quality ? { quality: filters.quality } : {}),
      ...(filters.zoneId ? { zoneId: filters.zoneId } : {}),
      ...(filters.from
        ? { receivedFrom: zoneLocalToIso(filters.from, timeZone) }
        : {}),
      ...(filters.to
        ? {
            receivedTo: new Date(
              Date.parse(zoneLocalToIso(filters.to, timeZone)) + 59_999,
            ).toISOString(),
          }
        : {}),
      limit: LIMIT,
      offset: (page - 1) * LIMIT,
    }),
    [operator.organizationId, filters, timeZone, page],
  );

  useEffect(() => {
    void refresh; // Intentional manual re-fetch trigger.

    const abort = new AbortController();
    setZones({ status: "loading" });
    listGisZones(operator.organizationId, abort.signal).then(
      (value) => {
        if (!abort.signal.aborted) setZones({ status: "success", value });
      },
      (error) => {
        if (!abort.signal.aborted)
          setZones({
            status: "error",
            error:
              error instanceof GisApiError
                ? error
                : new GisApiError(500, "ZONES_FAILED"),
          });
      },
    );
    return () => abort.abort();
  }, [operator.organizationId, refresh]);

  useEffect(() => {
    void refresh; // Intentional manual re-fetch trigger.

    const abort = new AbortController();
    setResult({ status: "loading" });
    listGisObservations(params, abort.signal).then(
      (value) => {
        if (!abort.signal.aborted) setResult({ status: "success", value });
      },
      (error) => {
        if (!abort.signal.aborted)
          setResult({
            status: "error",
            error:
              error instanceof GisApiError
                ? error
                : new GisApiError(500, "GIS_FAILED"),
          });
      },
    );
    return () => abort.abort();
    // `key` is the canonical serialized input; `params` is re-created only with input changes.
  }, [params, refresh]);

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const field of [
      "domain",
      "sourceId",
      "quality",
      "zoneId",
      "page",
      "receivedFrom",
      "receivedTo",
    ])
      url.searchParams.delete(field);
    if (filters.domain) url.searchParams.set("domain", filters.domain);
    if (filters.sourceId) url.searchParams.set("sourceId", filters.sourceId);
    if (filters.quality) url.searchParams.set("quality", filters.quality);
    if (filters.zoneId) url.searchParams.set("zoneId", filters.zoneId);
    if (params.receivedFrom)
      url.searchParams.set("receivedFrom", params.receivedFrom);
    if (params.receivedTo)
      url.searchParams.set("receivedTo", params.receivedTo);
    if (page > 1) url.searchParams.set("page", String(page));
    window.history.replaceState(null, "", url.toString());
  }, [filters, params, page]);

  function update(change: Partial<Filters>) {
    setFilters((prev) => ({ ...prev, ...change }));
    setPage(1);
    setSelectedId(null);
    setExpandedId(null);
  }

  function resetFilters() {
    setFilters({ ...empty });
    setPage(1);
    setSelectedId(null);
    setExpandedId(null);
  }

  function selectObservation(id: string) {
    setSelectedId(id);
    setExpandedId((current) => (current === id ? null : id));
    setCopiedId(null);
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
    } catch {
      setCopiedId(null);
    }
  }

  const rows = result.status === "success" ? result.value.items : EMPTY_ROWS;
  const total = result.status === "success" ? result.value.total : null;
  const shown = rows.filter((r) => approvedPoint(r) !== null).length;
  const withheld = rows.filter(
    (r) => r.location.hasCoordinates && !approvedPoint(r),
  ).length;
  const unknown = rows.filter((r) => !r.location.hasCoordinates).length;
  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const pages = total === null ? 1 : Math.max(1, Math.ceil(total / LIMIT));
  const onSelect = useCallback((id: string) => {
    setSelectedId(id);
    setExpandedId(id);
  }, []);
  const zoneRows = zones.status === "success" ? zones.value : [];
  const activeCount = [
    filters.domain,
    filters.sourceId,
    filters.quality,
    filters.zoneId,
    filters.from || filters.to,
  ].filter(Boolean).length;
  const filterProps = {
    filters,
    update,
    zoneRows,
    zoneStatus: zones.status,
    timeZone,
    sources,
  };
  const hasApprovedBasemap = Boolean(
    process.env.NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL?.trim() &&
      process.env.NEXT_PUBLIC_AUVRION_BASEMAP_ATTRIBUTION?.trim(),
  );
  const isSyntheticOnly =
    process.env.NODE_ENV === "development" && !hasApprovedBasemap;

  return (
    <OperatorLayout
      path="/operator/map"
      crumbs={[{ label: "Peta Observasi" }]}
      workspace
    >
      <div className="flex min-h-0 flex-1 flex-col bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-5 md:gap-3 md:px-4 md:py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] leading-6 font-semibold tracking-[-0.02em] text-ink md:text-[19px]">
              Peta Observasi
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <fieldset
              className="inline-flex items-center gap-0.5 rounded-md border border-line bg-bg p-0.5"
              aria-label="Mode tampilan"
            >
              <button
                type="button"
                onClick={() => {
                  setView("map");
                  setMobileView("map");
                }}
                aria-pressed={view === "map" && mobileView === "map"}
                aria-label="Tampilan peta"
                title="Peta"
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] px-3 text-[13px] font-medium transition-colors max-md:w-9 max-md:px-0 [&_svg]:size-4 ${view === "map" ? "bg-white text-ink shadow-sm ring-1 ring-line [&_svg]:text-brand" : "text-muted hover:text-fg"}`}
              >
                <GisIcon name="map" className="size-4" />
                <span className="max-md:sr-only">Peta</span>
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                aria-pressed={view === "table"}
                aria-label="Tampilan tabel"
                title="Tabel"
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[5px] px-3 text-[13px] font-medium transition-colors max-md:w-9 max-md:px-0 [&_svg]:size-4 ${view === "table" ? "bg-white text-ink shadow-sm ring-1 ring-line [&_svg]:text-brand" : "text-muted hover:text-fg"}`}
              >
                <GisIcon name="table" className="size-4" />
                <span className="max-md:sr-only">Tabel</span>
              </button>
            </fieldset>
            <button
              type="button"
              onClick={() => setRefresh((value) => value + 1)}
              aria-label="Muat ulang observasi"
              title="Muat ulang observasi"
              className="inline-flex size-10 shrink-0 items-center justify-center gap-2 rounded-md border border-line-strong bg-white text-[13px] font-normal text-fg transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand xl:h-10 xl:w-auto xl:px-4"
            >
              <GisIcon name="refresh" className="size-4" />
              <span className="hidden xl:inline">Muat ulang</span>
            </button>
          </div>
        </header>

        {/* On narrower workspaces, render one filter trigger rather than forcing all selects to wrap. */}
        <search
          aria-label="Filter observasi GIS"
          className="relative z-40 border-b border-line bg-white"
        >
          <div className="flex min-h-12 items-center gap-2 px-3 py-2 sm:px-4 min-[1280px]:hidden">
            <button
              type="button"
              aria-expanded={compactFiltersOpen}
              aria-haspopup="dialog"
              onClick={() => setCompactFiltersOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-white px-3 text-[13px] text-fg hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand"
            >
              <GisIcon name="filter" className="size-4" />
              Filter
            </button>
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
              {activeCount ? `${activeCount} filter aktif` : "Tanpa filter"}
            </span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="shrink-0 text-xs text-brand hover:underline"
              >
                Atur ulang
              </button>
            )}
          </div>
          <form
            onSubmit={(event) => event.preventDefault()}
            className="hidden min-h-12 min-w-0 items-center gap-3 px-4 py-2 min-[1280px]:flex"
          >
            <GisFilterFields {...filterProps} />
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-normal text-muted hover:text-brand"
            >
              <I.X className="size-3.5" />
              Atur ulang
            </button>
          </form>
        </search>
        <CompactFilterDialog
          open={compactFiltersOpen}
          onClose={() => setCompactFiltersOpen(false)}
          filters={filters}
          update={update}
          resetFilters={resetFilters}
          zones={zoneRows}
          zoneStatus={zones.status}
          sources={sources}
          timeZone={timeZone}
          count={total}
        />

        {zones.status === "error" && (
          <p
            role="status"
            className="border-b border-warn/25 bg-warn-50 px-4 py-2 text-xs text-warn"
          >
            Zona tidak dapat dimuat. Filter zona sementara tidak tersedia.
          </p>
        )}
        {result.status === "error" && (
          <div
            role="alert"
            className="border-b border-danger/25 bg-danger-50 px-4 py-3 text-sm text-danger"
          >
            Gagal memuat observasi (HTTP {result.error.status}).{" "}
            {result.error.code}.{" "}
            <button
              type="button"
              onClick={() => setRefresh((value) => value + 1)}
              className="underline"
            >
              Coba lagi
            </button>
          </div>
        )}

        {view === "map" ? (
          <div className="relative isolate flex min-h-120 flex-1 overflow-hidden max-md:min-h-0">
            <aside
              aria-label="Daftar observasi GIS"
              className={`flex shrink-0 flex-col overflow-hidden border-r border-line bg-white transition-[width] duration-200 ${collapsed ? "w-12" : "w-[min(32vw,420px)] max-[900px]:w-[min(46vw,350px)]"} ${mobileView === "map" ? "max-md:hidden" : "max-md:absolute max-md:inset-0 max-md:z-20 max-md:w-full! max-md:border-r-0 max-md:pb-20"}`}
            >
              {collapsed ? (
                <button
                  type="button"
                  onClick={() => setCollapsed(false)}
                  aria-label="Tampilkan panel observasi"
                  title="Tampilkan panel observasi"
                  className="flex h-full flex-col items-center gap-3 py-4 text-xs text-muted hover:bg-bg"
                >
                  <GisIcon name="panel-open" className="size-4.5" />
                  <span style={{ writingMode: "vertical-rl" }}>
                    Observasi {total ?? "…"}
                  </span>
                </button>
              ) : (
                <>
                  <div className="shrink-0 border-b border-line px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="truncate text-[16px] font-semibold text-ink">
                        Observasi{" "}
                        <span className="ml-1 font-normal text-muted">
                          {total ?? "…"}
                        </span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        aria-label="Sembunyikan panel daftar"
                        title="Sembunyikan panel observasi"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted hover:bg-bg max-md:hidden"
                      >
                        <GisIcon name="panel-close" className="size-4.5" />
                      </button>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {activeCount ? "Observasi terfilter" : "Semua observasi"}{" "}
                      · {operator.orgName}
                    </p>
                    <div
                      className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-bg"
                      role="img"
                      aria-label={`${shown} dengan koordinat disetujui, ${withheld} ditahan, ${unknown} lokasi tak diketahui pada halaman ini`}
                    >
                      {rows.length > 0 && (
                        <>
                          <span
                            className="bg-brand"
                            style={{ width: `${(shown / rows.length) * 100}%` }}
                          />
                          <span
                            className="bg-[#b59059]"
                            style={{
                              width: `${(unknown / rows.length) * 100}%`,
                            }}
                          />
                          <span
                            className="bg-[#bd6b74]"
                            style={{
                              width: `${(withheld / rows.length) * 100}%`,
                            }}
                          />
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                      <span>
                        <b className="mr-1 text-brand">{shown}</b>
                        {isSyntheticOnly ? "koordinat disetujui" : "di peta"}
                      </span>
                      <span>
                        <b className="mr-1 text-[#b59059]">{unknown}</b>lokasi
                        tak diketahui
                      </span>
                      <span>
                        <b className="mr-1 text-[#bd6b74]">{withheld}</b>ditahan
                      </span>
                    </div>
                    {total !== null && total > rows.length && (
                      <p className="mt-1 text-[10px] text-muted">
                        Ringkasan posisi hanya untuk halaman ini.
                      </p>
                    )}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {result.status === "loading" && (
                      <p className="p-4 text-sm text-muted">
                        Memuat observasi…
                      </p>
                    )}
                    {result.status === "success" && rows.length === 0 && (
                      <p className="p-4 text-sm text-muted">
                        Tidak ada observasi yang cocok dengan filter.
                      </p>
                    )}
                    {rows.map((row) => {
                      const expanded = expandedId === row.id;
                      const sourcePoint = approvedPoint(row);
                      const canCenter =
                        sourcePoint !== null && hasApprovedBasemap;
                      return (
                        <article
                          key={row.id}
                          className={`border-b border-line ${expanded ? "border-l-[3px] border-l-brand bg-brand-50/50" : selectedId === row.id ? "bg-brand-50/40" : "bg-white"}`}
                        >
                          <button
                            type="button"
                            onClick={() => selectObservation(row.id)}
                            aria-expanded={expanded}
                            aria-controls={`gis-record-${row.id}`}
                            className="w-full px-4 py-3 text-left hover:bg-brand-50/60 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand"
                          >
                            <span className="flex min-w-0 items-start gap-2">
                              <span
                                className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-white ${row.domain === "biodiversity" ? "bg-brand" : "bg-[#3d5870]"}`}
                              >
                                {row.domain === "biodiversity" ? (
                                  <I.Leaf className="size-3" />
                                ) : (
                                  <I.Gauge className="size-3" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
                                {row.source.code}
                              </span>
                              <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">
                                {formatDate(row.receivedAt, timeZone)}
                              </span>
                              <GisIcon
                                name="chevron-down"
                                className={`mt-1 size-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                              />
                            </span>
                            <span className="ml-7 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                              <QualityChip quality={row.quality} />
                              <span className="inline-flex items-center gap-1 text-muted">
                                {sourcePoint ? (
                                  <I.MapPin className="size-3.5 text-brand" />
                                ) : (
                                  <I.Lock className="size-3.5" />
                                )}
                                <LocationText row={row} />
                              </span>
                            </span>
                            <span className="ml-7 mt-1 block truncate text-[11px] text-muted">
                              ID: {row.id}
                            </span>
                          </button>
                          {expanded && (
                            <div
                              id={`gis-record-${row.id}`}
                              className="px-4 pb-4 pl-11"
                            >
                              <ObservationMetadata
                                row={row}
                                timeZone={timeZone}
                              />
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={!canCenter}
                                  title={
                                    !canCenter
                                      ? "Pusatkan hanya tersedia untuk koordinat disetujui pada basemap nyata"
                                      : "Pusatkan titik observasi pada peta"
                                  }
                                  onClick={() => {
                                    setSelectedId(row.id);
                                    setFocusTarget((previous) => ({
                                      id: row.id,
                                      request: (previous?.request ?? 0) + 1,
                                    }));
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-white px-2.5 py-2 text-[11px] text-ink hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <I.MapPin className="size-3.5" />
                                  Pusatkan di peta
                                </button>
                                <a
                                  href={`/operator/observations/${encodeURIComponent(row.id)}`}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-white px-2.5 py-2 text-[11px] text-ink hover:bg-bg"
                                >
                                  Lihat detail{" "}
                                  <I.ArrowRight className="size-3.5" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => void copyId(row.id)}
                                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-brand"
                                >
                                  <I.Copy className="size-3.5" />
                                  {copiedId === row.id
                                    ? "Tersalin"
                                    : "Salin ID"}
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <div className="shrink-0 border-t border-line px-3 py-2 text-[10px] text-muted">
                    Diurutkan menurut waktu diterima, terbaru lebih dulu ·{" "}
                    {timeZone}
                  </div>
                  <Pagination
                    current={page}
                    pages={pages}
                    onPage={(nextPage) => {
                      setPage(nextPage);
                      setSelectedId(null);
                      setExpandedId(null);
                    }}
                  />
                </>
              )}
            </aside>

            <section
              aria-label="Area peta observasi"
              className="relative isolate min-w-0 flex-1"
            >
              <GisMapCanvas
                rows={rows}
                selected={selectedId}
                onSelect={onSelect}
                focusTarget={focusTarget}
                hotspots={hotspots}
                hotspotBounds={hotspotBounds}
                airQualitySites={airQualitySites}
                onPickedLocationChange={setPickedMapLocation}
                selectedTimeZone={INDONESIA_TIME_ZONES[timeZone]}
              />
              <WebGisIntelPanel
                organizationId={operator.organizationId}
                enabled={hasApprovedBasemap}
                onFeatures={setHotspots}
                onBounds={setHotspotBounds}
              />
              <AirQualityControl
                organizationId={operator.organizationId}
                enabled={hasApprovedBasemap}
                selectedPoint={pickedMapLocation}
                onSites={setAirQualitySites}
              />
              {result.status === "success" && rows.length > shown && (
                <div className="absolute top-16 left-4 z-10 hidden max-w-[calc(100%-5rem)] items-center gap-2 rounded-md border border-line bg-white/95 px-2.5 py-2 text-[11px] text-muted shadow-sm md:inline-flex">
                  <I.Lock className="size-3.5 shrink-0" />
                  <span>
                    {rows.length - shown} dari {rows.length} observasi tanpa
                    titik di peta
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsed(false);
                      setMobileView("list");
                    }}
                    className="shrink-0 text-brand hover:underline md:hidden"
                  >
                    Lihat daftar
                  </button>
                </div>
              )}
              {selected && (
                <div className="absolute bottom-24 right-6 z-10 w-[min(360px,calc(100%-3rem))] rounded-xl border border-line bg-white p-4 shadow-lg max-md:bottom-[calc(6.25rem+var(--safe-bottom,0px))] max-md:right-3 max-md:left-3 max-md:w-auto max-md:max-h-[52%] max-md:overflow-y-auto">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-white ${selected.domain === "biodiversity" ? "bg-brand" : "bg-[#3d5870]"}`}
                    >
                      {selected.domain === "biodiversity" ? (
                        <I.Leaf className="size-3.5" />
                      ) : (
                        <I.Gauge className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-semibold text-ink">
                        {selected.source.code}
                      </h3>
                      <p className="text-xs text-muted">
                        {DOMAIN[selected.domain].label}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Tutup ringkasan"
                      title="Tutup ringkasan"
                      onClick={() => setSelectedId(null)}
                      className="rounded p-1 text-muted hover:bg-bg"
                    >
                      <I.X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[11px]">
                    <span className="text-muted">Kualitas</span>
                    <QualityChip quality={selected.quality} />
                    <span className="text-muted">Diterima</span>
                    <span className="text-ink">
                      {formatFullDate(selected.receivedAt, timeZone)}
                    </span>
                    <span className="text-muted">Zona</span>
                    <span className="text-ink">{getZoneName(selected)}</span>
                    <span className="text-muted">Lokasi</span>
                    <span className="text-ink">
                      <LocationText row={selected} />
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <a
                      href={`/operator/observations/${encodeURIComponent(selected.id)}`}
                      className="inline-flex items-center gap-2 rounded-md border border-line-strong px-3 py-2 text-[11px] text-ink hover:bg-bg"
                    >
                      Lihat detail <I.ArrowRight className="size-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void copyId(selected.id)}
                      className="inline-flex items-center gap-1.5 px-2 py-2 text-[11px] text-muted hover:text-brand"
                    >
                      <I.Copy className="size-3.5" />
                      {copiedId === selected.id ? "Tersalin" : "Salin ID"}
                    </button>
                  </div>
                  {isSyntheticOnly && (
                    <p className="mt-2 text-[10px] text-muted">
                      Kartu ini berasal dari daftar; peta skematis tidak
                      menempatkan titik data nyata.
                    </p>
                  )}
                </div>
              )}
            </section>
            {/* Figma mobile: Peta fills the screen, Daftar replaces it as an overlay. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1.75rem+var(--safe-bottom,0px))] z-30 flex justify-center md:hidden">
              <fieldset
                aria-label="Tampilan peta atau daftar"
                className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-line bg-white p-1 shadow-lg"
              >
                <button
                  type="button"
                  aria-pressed={mobileView === "map"}
                  onClick={() => setMobileView("map")}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors ${mobileView === "map" ? "bg-ink text-white" : "text-fg hover:bg-bg"}`}
                >
                  <GisIcon name="map" className="size-4" /> Peta
                </button>
                <button
                  type="button"
                  aria-pressed={mobileView === "list"}
                  onClick={() => {
                    setCollapsed(false);
                    setMobileView("list");
                  }}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors ${mobileView === "list" ? "bg-ink text-white" : "text-fg hover:bg-bg"}`}
                >
                  <I.List className="size-4" /> Daftar
                  {total !== null && (
                    <span className="text-xs opacity-75">{total}</span>
                  )}
                </button>
              </fieldset>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-ink">
              Daftar observasi
            </h2>
            {result.status === "loading" && (
              <p className="text-sm text-muted">Memuat…</p>
            )}
            {result.status === "success" && rows.length === 0 && (
              <p className="text-sm text-muted">Tidak ada data yang cocok.</p>
            )}
            <table className="w-full min-w-150 text-left text-[13px]">
              <caption className="sr-only">
                Observasi GIS dengan filter yang sama seperti tampilan peta
              </caption>
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-3 py-3">Sumber</th>
                  <th className="px-3 py-3">Domain</th>
                  <th className="px-3 py-3">Diterima</th>
                  <th className="px-3 py-3">Kualitas</th>
                  <th className="px-3 py-3">Lokasi</th>
                  <th className="px-3 py-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-3 font-medium text-ink">
                      {row.source.code}
                    </td>
                    <td className="px-3 py-3">{DOMAIN[row.domain].label}</td>
                    <td className="px-3 py-3">
                      {formatDate(row.receivedAt, timeZone)}
                    </td>
                    <td className="px-3 py-3">
                      <QualityChip quality={row.quality} />
                    </td>
                    <td className="px-3 py-3">
                      <LocationText row={row} />
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={`/operator/observations/${encodeURIComponent(row.id)}`}
                        className="text-brand underline"
                      >
                        Buka
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              current={page}
              pages={pages}
              onPage={(nextPage) => {
                setPage(nextPage);
                setSelectedId(null);
                setExpandedId(null);
              }}
            />
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {total === null
          ? "Memuat observasi"
          : `${total} observasi cocok dengan filter.`}
      </p>
    </OperatorLayout>
  );
}

/** Native Figma filter sheet: modal top-layer, Escape/backdrop dismissal, shared live server filters. */
function CompactFilterDialog({
  open,
  onClose,
  filters,
  update,
  resetFilters,
  zones,
  zoneStatus,
  sources,
  timeZone,
  count,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  update: (change: Partial<Filters>) => void;
  resetFilters: () => void;
  zones: GisZone[];
  zoneStatus: QueryState<GisZone[]>["status"];
  sources: Source[];
  timeZone: "WIB" | "WITA" | "WIT";
  count: number | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [customTime, setCustomTime] = useState(false);
  const showTimeRange = customTime || Boolean(filters.from || filters.to);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const fieldClass =
    "mt-1.5 h-11 w-full min-w-0 rounded-md border border-line-strong bg-white px-3 text-[13px] text-fg focus:border-brand focus:outline-2 focus:outline-offset-1 focus:outline-brand";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(event) => {
        // Backdrop pointer interaction is delivered to the dialog itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-140 rounded-xl border border-line bg-white p-0 text-fg shadow-2xl backdrop:bg-[#152d2580] max-sm:mt-auto max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-[17px] font-semibold text-ink">
            Filter observasi
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup filter"
            className="grid size-9 place-items-center rounded-md text-muted hover:bg-bg focus-visible:outline-2 focus-visible:outline-brand"
          >
            <I.X className="size-5" />
          </button>
        </header>
        <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-5">
          <GisFilterDropdown
            modal
            label="Domain"
            value={filters.domain}
            onChange={(domain) => update({ domain })}
            options={domainOptions}
          />
          <GisFilterDropdown
            modal
            label="Sumber"
            value={filters.sourceId}
            onChange={(sourceId) => update({ sourceId })}
            options={sourceOptions(sources)}
          />
          <GisFilterDropdown
            modal
            label="Kualitas"
            value={filters.quality}
            onChange={(quality) => update({ quality })}
            options={qualityOptions}
          />
          <GisFilterDropdown
            modal
            label="Zona operasional"
            value={filters.zoneId}
            disabled={zoneStatus !== "success"}
            onChange={(zoneId) => update({ zoneId })}
            options={zoneOptions(zones)}
          />
          {zoneStatus === "error" && (
            <p className="text-xs text-warn">Daftar zona belum tersedia.</p>
          )}
          <GisFilterDropdown
            modal
            label="Waktu diterima"
            value={showTimeRange ? "custom" : "all"}
            onChange={(choice) => {
              if (choice === "all") {
                setCustomTime(false);
                update({ from: "", to: "" });
              } else setCustomTime(true);
            }}
            options={[
              { value: "all", label: "Semua waktu" },
              { value: "custom", label: `Rentang khusus (${timeZone})` },
            ]}
          />
          {showTimeRange && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[13px] font-medium text-muted">
                Dari ({timeZone})
                <input
                  type="datetime-local"
                  className={fieldClass}
                  value={filters.from}
                  onChange={(event) => update({ from: event.target.value })}
                />
              </label>
              <label className="text-[13px] font-medium text-muted">
                Sampai ({timeZone})
                <input
                  type="datetime-local"
                  className={fieldClass}
                  value={filters.to}
                  onChange={(event) => update({ to: event.target.value })}
                />
              </label>
            </div>
          )}
          <p className="text-[11px] leading-5 text-muted">
            Waktu mengikuti zona tampilan {timeZone}. Rentang diterapkan ke data
            observasi organisasi yang sedang dipilih, bukan jam simulasi Figma.
          </p>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => {
              resetFilters();
              setCustomTime(false);
            }}
            className="rounded-md px-2 py-2 text-[13px] font-medium text-brand hover:bg-brand-50"
          >
            Atur ulang
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-md bg-brand px-5 py-2 text-[13px] font-semibold text-white hover:opacity-90"
          >
            {count === null
              ? "Tampilkan hasil"
              : `Tampilkan ${count} observasi`}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

const domainOptions: GisDropdownOption<Filters["domain"]>[] = [
  { value: "", label: "Semua domain", short: "Semua" },
  { value: "biodiversity", label: DOMAIN.biodiversity.label, short: "Hayati" },
  {
    value: "environmental_risk",
    label: DOMAIN.environmental_risk.label,
    short: "Risiko lingkungan",
  },
];
const qualityOptions: GisDropdownOption<Filters["quality"]>[] = [
  { value: "", label: "Semua kualitas", short: "Semua" },
  ...Object.entries(QUALITY).map(([value, description]) => ({
    value: value as Filters["quality"],
    label: description.label,
  })),
];
const sourceOptions = (sources: Source[]): GisDropdownOption<string>[] => [
  { value: "", label: "Semua sumber", short: "Semua" },
  ...sources.map((source) => ({
    value: source.id,
    label: source.code,
    hint: `${source.name}${source.active ? "" : " · nonaktif"}`,
  })),
];
const zoneOptions = (zones: GisZone[]): GisDropdownOption<string>[] => [
  { value: "", label: "Semua zona", short: "Semua" },
  ...zones.map((zone) => ({ value: zone.id, label: zone.name })),
];

function GisFilterFields({
  filters,
  update,
  zoneRows,
  zoneStatus,
  timeZone,
  sources,
}: {
  filters: Filters;
  update: (change: Partial<Filters>) => void;
  zoneRows: GisZone[];
  zoneStatus: QueryState<GisZone[]>["status"];
  timeZone: "WIB" | "WITA" | "WIT";
  sources: Source[];
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
      <GisFilterDropdown
        className="w-41.5 min-w-0 shrink"
        label="Domain"
        value={filters.domain}
        onChange={(domain) => update({ domain })}
        options={domainOptions}
      />
      <GisFilterDropdown
        className="w-67.5 min-w-0 shrink"
        label="Sumber"
        value={filters.sourceId}
        onChange={(sourceId) => update({ sourceId })}
        options={sourceOptions(sources)}
      />
      <GisFilterDropdown
        className="w-48 min-w-0 shrink"
        label="Kualitas"
        value={filters.quality}
        onChange={(quality) => update({ quality })}
        options={qualityOptions}
      />
      <GisReceivedTimeDropdown
        from={filters.from}
        to={filters.to}
        timeZone={timeZone}
        onChange={update}
      />
      <GisFilterDropdown
        className="w-39 min-w-0 shrink"
        label="Zona"
        value={filters.zoneId}
        disabled={zoneStatus !== "success"}
        alignEnd
        onChange={(zoneId) => update({ zoneId })}
        options={zoneOptions(zoneRows)}
      />
    </div>
  );
}

function QualityChip({ quality }: { quality: Quality }) {
  const style = {
    unreviewed: "border-line-strong bg-white text-muted",
    valid: "border-[#a9d8c7] bg-[#e9f6ef] text-brand",
    suspect: "border-[#e7ca9b] bg-[#fff6e9] text-[#a66c19]",
    invalid: "border-[#e8b5b8] bg-[#fff0f1] text-[#ad4958]",
  }[quality];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 ${style}`}
    >
      <span className="inline-block size-1.5 rounded-full border border-current" />
      {QUALITY[quality].label}
    </span>
  );
}

/** Only show server-returned metadata. No synthetic zones, timestamps or locations are invented. */
function readField(row: GisRecord, name: string): string | null {
  const value = (row as unknown as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value : null;
}

function getZoneName(row: GisRecord): string {
  if (!row.location.hasCoordinates) return "Tidak diketahui";
  if (!approvedPoint(row)) return "Ditahan server";
  const zone = (row as unknown as Record<string, unknown>).zone;
  if (
    zone &&
    typeof zone === "object" &&
    "name" in zone &&
    typeof zone.name === "string"
  ) {
    return zone.name;
  }
  return readField(row, "zoneName") ?? "Belum tersedia";
}

function formatFullDate(value: string, zone: "WIB" | "WITA" | "WIT") {
  const timeZone = {
    WIB: "Asia/Jakarta",
    WITA: "Asia/Makassar",
    WIT: "Asia/Jayapura",
  }[zone];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak diketahui";
  return `${date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  })} ${zone}`;
}

function ObservationMetadata({
  row,
  timeZone,
}: {
  row: GisRecord;
  timeZone: "WIB" | "WITA" | "WIT";
}) {
  const observedAt = readField(row, "observedAt");
  const mode = readField(row, "ingestionMode");
  const modeLabel =
    mode && Object.hasOwn(MODE, mode)
      ? MODE[mode as keyof typeof MODE]
      : "Belum tersedia";
  const metadata = [
    ["Domain", DOMAIN[row.domain].label],
    [
      "Diamati",
      observedAt ? formatFullDate(observedAt, timeZone) : "Tidak diketahui",
    ],
    ["Diterima", formatFullDate(row.receivedAt, timeZone)],
    ["Mode", modeLabel],
    [
      "Lokasi",
      !row.location.hasCoordinates
        ? "Tidak diketahui"
        : approvedPoint(row)
          ? "Koordinat disetujui server"
          : "Ditahan server",
    ],
    ["Zona", getZoneName(row)],
    ["ID", row.id],
  ];
  return (
    <dl className="grid grid-cols-[minmax(65px,0.4fr)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[11px] leading-5">
      {metadata.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 wrap-break-word text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Local, dependency-free icons to match Figma's outlined map controls. */
function GisIcon({
  name,
  className = "size-4",
}: {
  name:
    | "map"
    | "table"
    | "refresh"
    | "filter"
    | "chevron-down"
    | "panel-open"
    | "panel-close";
  className?: string;
}) {
  const paths = {
    map: (
      <>
        <path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2Z" />
        <path d="M9 4.5v13M15 6.5v13" />
      </>
    ),
    table: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
      </>
    ),
    refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
    filter: (
      <>
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2" />
        <circle cx="9" cy="17" r="2" />
      </>
    ),
    "chevron-down": <path d="M6 9l6 6 6-6" />,
    "panel-close": (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M9.5 4.5v15M15.5 10l-2 2 2 2" />
      </>
    ),
    "panel-open": (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M9.5 4.5v15M13.5 10l2 2-2 2" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Pagination({
  current,
  pages,
  onPage,
}: {
  current: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Paginasi observasi GIS"
      className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-white px-3 py-2 text-xs"
    >
      <button
        type="button"
        disabled={current <= 1}
        onClick={() => onPage(current - 1)}
        className="rounded border border-line px-2 py-1 text-muted hover:bg-bg disabled:opacity-40"
      >
        Sebelumnya
      </button>
      <span className="whitespace-nowrap text-muted">
        {current} / {pages}
      </span>
      <button
        type="button"
        disabled={current >= pages}
        onClick={() => onPage(current + 1)}
        className="rounded border border-line px-2 py-1 text-muted hover:bg-bg disabled:opacity-40"
      >
        Berikutnya
      </button>
    </nav>
  );
}
