"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SelectMenu } from "@/components/ui/SelectMenu";
import * as I from "../../components/icons";
import { OperatorLayout } from "../../components/operator/OperatorLayout";
import {
  DomainLabel,
  ErrorState,
  LoadingRows,
  Mono,
  PageTitle,
  QualityBadge,
  Unknown,
  useQuery,
} from "../../components/operator/parts";
import { Button, cx, FieldError, linkBtn } from "../../components/ui";
import {
  DOMAIN,
  type Domain,
  fmtTs,
  listObservations,
  MODE,
  QUALITY,
  type Quality,
  sourceById,
} from "../../observations";
import { useOperator } from "../../operator-context";
import {
  type IndonesianTimeZone,
  isoToZoneLocal,
  zoneLocalToIso,
} from "../../time";

const LIMIT = 5;
type F = {
  domain: "" | Domain;
  sourceId: string;
  quality: "" | Quality;
  from: string;
  to: string;
};
const EMPTY: F = { domain: "", sourceId: "", quality: "", from: "", to: "" };

/** Last list URL, so detail pages return to the same filtered page. */
export let lastListHref = "/operator/observations";

export const opSelect =
  "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-fg focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none";

function parse(
  query: string,
  zone: IndonesianTimeZone,
): { f: F; page: number } {
  const p = new URLSearchParams(query);
  const d = p.get("domain"),
    q = p.get("quality"),
    rf = p.get("receivedFrom"),
    rt = p.get("receivedTo");
  return {
    f: {
      domain: d && d in DOMAIN ? (d as Domain) : "",
      quality: q && q in QUALITY ? (q as Quality) : "",
      sourceId: p.get("sourceId") ?? "",
      from: rf ? isoToZoneLocal(rf, zone) : "",
      to: rt ? isoToZoneLocal(rt, zone) : "",
    },
    page: Math.max(1, Number(p.get("page")) || 1),
  };
}

export function Observations() {
  const { operator: OPERATOR, sources: SOURCES, timeZone } = useOperator();
  const query = useSearchParams().toString();
  // URL always stores UTC. Input values are interpreted using their own associated zone.
  const [f, setF] = useState<F>(() => parse(query, "WIB").f);
  const [page, setPage] = useState(() => parse(query, "WIB").page);
  const [filterZone, setFilterZone] = useState<IndonesianTimeZone>("WIB");
  useEffect(() => {
    if (filterZone === timeZone) return;
    // Preserve the UTC instant when the display zone changes.
    const convert = (value: string) =>
      value ? isoToZoneLocal(zoneLocalToIso(value, filterZone), timeZone) : "";
    setF((current) => ({
      ...current,
      from: convert(current.from),
      to: convert(current.to),
    }));
    setFilterZone(timeZone);
  }, [filterZone, timeZone]);
  const rangeErr =
    f.from && f.to && f.from > f.to
      ? 'Waktu "dari" harus sebelum atau sama dengan waktu "sampai".'
      : "";
  const params = useMemo(
    () => ({
      organizationId: OPERATOR.organizationId,
      domain: f.domain || undefined,
      sourceId: f.sourceId || undefined,
      quality: f.quality || undefined,
      receivedFrom:
        f.from && !rangeErr ? zoneLocalToIso(f.from, filterZone) : undefined,
      // "to" is inclusive of the whole selected minute.
      receivedTo:
        f.to && !rangeErr
          ? new Date(
              Date.parse(zoneLocalToIso(f.to, filterZone)) + 59_999,
            ).toISOString()
          : undefined,
      limit: LIMIT,
      offset: (page - 1) * LIMIT,
    }),
    [
      OPERATOR.organizationId,
      f.domain,
      f.sourceId,
      f.quality,
      f.from,
      f.to,
      rangeErr,
      page,
      filterZone,
    ],
  );
  const load = useCallback(() => listObservations(params), [params]);
  const q = useQuery(load);
  const active = Object.values(f).some(Boolean);

  // Persist the current scoped filters without converting the page into client-only fake navigation.
  const targetHref = useMemo(() => {
    const u = new URLSearchParams();
    if (f.domain) u.set("domain", f.domain);
    if (f.sourceId) u.set("sourceId", f.sourceId);
    if (f.quality) u.set("quality", f.quality);
    if (params.receivedFrom) u.set("receivedFrom", params.receivedFrom);
    if (f.to && !rangeErr)
      u.set("receivedTo", zoneLocalToIso(f.to, filterZone));
    if (page > 1) u.set("page", String(page));
    const search = u.toString();
    return `/operator/observations${search ? `?${search}` : ""}`;
  }, [
    f.domain,
    f.sourceId,
    f.quality,
    f.to,
    params.receivedFrom,
    rangeErr,
    page,
    filterZone,
  ]);
  useEffect(() => {
    lastListHref = targetHref;
    if (`${window.location.pathname}${window.location.search}` !== targetHref) {
      window.history.replaceState(null, "", targetHref);
    }
  }, [targetHref]);

  const upd = (p: Partial<F>) => {
    setF((x) => ({ ...x, ...p }));
    setPage(1);
  };
  const reset = () => {
    setF(EMPTY);
    setPage(1);
  };
  const data = q.status === "ok" ? q.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  useEffect(() => {
    if (data && page > pages) setPage(pages);
  }, [data, page, pages]);
  const dt = cx(
    opSelect,
    "mt-1 h-11 bg-white px-3 text-sm transition-colors hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-brand",
    rangeErr && "border-danger",
  );

  return (
    <OperatorLayout
      path="/operator/observations"
      crumbs={[{ label: "Observasi" }]}
    >
      <PageTitle
        title="Observasi"
        actions={
          <a
            href="/operator/observations/new"
            className={`${linkBtn()} h-9 text-[13px]`}
          >
            <I.Plus />
            Catat observasi
          </a>
        }
      />

      <form
        aria-label="Filter observasi"
        onSubmit={(e) => e.preventDefault()}
        className="mb-4 rounded-md border border-line bg-surface p-3"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_minmax(0,1.2fr)]">
          <div className="text-xs font-medium text-muted lg:col-span-2 xl:col-span-1">
            <SelectMenu
              label="Domain"
              value={f.domain}
              onChange={(value) => upd({ domain: value as F["domain"] })}
              className="mt-1"
              options={[
                { value: "", label: "Semua domain" },
                ...(Object.keys(DOMAIN) as Domain[]).map((domain) => ({
                  value: domain,
                  label: DOMAIN[domain].label,
                })),
              ]}
            />
          </div>
          <div className="text-xs font-medium text-muted lg:col-span-2 xl:col-span-1">
            <SelectMenu
              label="Sumber"
              value={f.sourceId}
              onChange={(value) => upd({ sourceId: value })}
              className="mt-1"
              options={[
                { value: "", label: "Semua sumber" },
                ...SOURCES.map((source) => ({
                  value: source.id,
                  label: `${source.code}${source.active ? "" : " (nonaktif)"}`,
                })),
              ]}
            />
          </div>
          <div className="text-xs font-medium text-muted lg:col-span-2 xl:col-span-1">
            <SelectMenu
              label="Kualitas"
              value={f.quality}
              onChange={(value) => upd({ quality: value as F["quality"] })}
              className="mt-1"
              options={[
                { value: "", label: "Semua kualitas" },
                ...(Object.keys(QUALITY) as Quality[]).map((quality) => ({
                  value: quality,
                  label: QUALITY[quality].label,
                })),
              ]}
            />
          </div>
          <label className="text-xs font-medium text-muted lg:col-span-3 xl:col-span-1">
            Diterima dari ({timeZone})
            <input
              type="datetime-local"
              value={f.from}
              onChange={(e) => upd({ from: e.target.value })}
              aria-invalid={!!rangeErr || undefined}
              aria-describedby={rangeErr ? "range-err" : undefined}
              className={dt}
            />
          </label>
          <label className="text-xs font-medium text-muted lg:col-span-3 xl:col-span-1">
            Diterima sampai ({timeZone})
            <input
              type="datetime-local"
              value={f.to}
              onChange={(e) => upd({ to: e.target.value })}
              aria-invalid={!!rangeErr || undefined}
              aria-describedby={rangeErr ? "range-err" : undefined}
              className={dt}
            />
          </label>
        </div>
        {rangeErr && <FieldError id="range-err">{rangeErr}</FieldError>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-[13px]">
          <p className="text-muted" aria-live="polite">
            {data ? (
              <>
                <span className="tnum font-medium text-fg">{data.total}</span>{" "}
                rekaman{active ? " cocok dengan filter" : " di organisasi ini"}
              </>
            ) : q.status === "loading" ? (
              "Memuat…"
            ) : (
              "Jumlah tidak tersedia"
            )}
          </p>
          <button
            type="button"
            onClick={reset}
            disabled={!active}
            className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 font-medium text-brand hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-muted/70 disabled:hover:bg-transparent"
          >
            <I.X className="size-3.5" />
            Atur ulang filter
          </button>
        </div>
      </form>

      {q.status === "error" ? (
        <ErrorState error={q.error} retry={q.retry} />
      ) : (
        <div className="rounded-md border border-line bg-surface">
          {q.status === "loading" ? (
            <LoadingRows rows={LIMIT} />
          ) : data?.total === 0 ? (
            active ? (
              <div className="px-4 py-10 text-center text-sm">
                <p className="font-medium">Tidak ada observasi yang cocok</p>
                <p className="mt-1 text-muted">
                  Longgarkan rentang waktu atau ubah filter sumber dan kualitas.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4 h-9 text-[13px]"
                  onClick={reset}
                >
                  Atur ulang filter
                </Button>
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm">
                <p className="font-medium">
                  Belum ada observasi di organisasi ini
                </p>
                <p className="mt-1 text-muted">
                  Catat observasi manual pertama, atau tunggu rekaman dari
                  sumber terdaftar.
                </p>
                <a
                  href="/operator/observations/new"
                  className={`${linkBtn("secondary")} mt-4 h-9 text-[13px]`}
                >
                  Catat observasi
                </a>
              </div>
            )
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Daftar observasi, halaman {page} dari {pages}
                  </caption>
                  <thead className="border-b border-line bg-bg/60 text-[13px] text-muted">
                    <tr>
                      {[
                        "ID observasi",
                        "Domain",
                        "Kode sumber",
                        `Diamati (${timeZone})`,
                        `Diterima (${timeZone})`,
                        "Mode",
                        "Kualitas",
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="px-3 py-2 font-medium whitespace-nowrap first:pl-4"
                        >
                          {h}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 pr-4">
                        <span className="sr-only">Tindakan</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data?.items.map((o) => (
                      <tr key={o.id} className="hover:bg-bg/70">
                        <th scope="row" className="py-3 pr-3 pl-4 font-normal">
                          <Mono className="font-medium text-ink">{o.id}</Mono>
                        </th>
                        <td className="px-3 py-3">
                          <DomainLabel d={o.domain} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Mono>
                            {sourceById(o.sourceId, SOURCES)?.code ??
                              o.sourceCode}
                          </Mono>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {o.observedAt ? (
                            <Mono className="tnum">
                              {fmtTs(o.observedAt, timeZone, false)}
                            </Mono>
                          ) : (
                            <Unknown>Tidak diketahui</Unknown>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <Mono className="tnum text-muted">
                            {fmtTs(o.receivedAt, timeZone, false)}
                          </Mono>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted">
                          {MODE[o.ingestionMode]}
                        </td>
                        <td className="px-3 py-3">
                          <QualityBadge q={o.quality} />
                        </td>
                        <td className="px-3 py-3 pr-4 text-right">
                          <a
                            href={`/operator/observations/${o.id}`}
                            className="inline-flex items-center gap-0.5 rounded font-medium whitespace-nowrap text-brand hover:underline"
                          >
                            Detail<span className="sr-only"> {o.id}</span>
                            <I.Chevron className="size-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul
                className="divide-y divide-line lg:hidden"
                aria-label={`Daftar observasi, halaman ${page} dari ${pages}`}
              >
                {data?.items.map((o) => (
                  <li key={o.id}>
                    <a
                      href={`/operator/observations/${o.id}`}
                      className="block px-4 py-3 hover:bg-bg"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Mono className="font-medium text-ink">{o.id}</Mono>
                        <QualityBadge q={o.quality} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <DomainLabel d={o.domain} />
                        <Mono className="text-muted">
                          {sourceById(o.sourceId, SOURCES)?.code ??
                            o.sourceCode}
                        </Mono>
                        <span className="text-xs text-muted">
                          {MODE[o.ingestionMode]}
                        </span>
                      </div>
                      <dl className="mt-2 grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-0.5 text-xs">
                        <dt className="text-muted">Diamati</dt>
                        <dd>
                          {o.observedAt ? (
                            <Mono className="tnum text-xs">
                              {fmtTs(o.observedAt, timeZone)}
                            </Mono>
                          ) : (
                            <Unknown>Tidak diketahui</Unknown>
                          )}
                        </dd>
                        <dt className="text-muted">Diterima</dt>
                        <dd>
                          <Mono className="tnum text-xs">
                            {fmtTs(o.receivedAt, timeZone)}
                          </Mono>
                        </dd>
                      </dl>
                    </a>
                  </li>
                ))}
              </ul>
              <nav
                aria-label="Paginasi"
                className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px]"
              >
                <p className="tnum text-muted">
                  {(data?.offset ?? 0) + 1}–
                  {(data?.offset ?? 0) + (data?.items.length ?? 0)} dari{" "}
                  {data?.total}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page <= 1}
                    aria-label="Halaman sebelumnya"
                    className="grid size-8 place-items-center rounded-md border border-line-strong hover:bg-bg disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <I.ArrowLeft className="size-3.5" />
                  </button>
                  <span className="tnum px-1.5" aria-live="polite">
                    Hal. {page} / {pages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= pages}
                    aria-label="Halaman berikutnya"
                    className="grid size-8 place-items-center rounded-md border border-line-strong hover:bg-bg disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <I.ArrowRight className="size-3.5" />
                  </button>
                </div>
              </nav>
            </>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Koordinat presisi tidak ditampilkan; API menahannya sesuai kebijakan
        privasi lokasi.
      </p>
    </OperatorLayout>
  );
}
