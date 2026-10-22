"use client";

import { useCallback } from "react";
import { ListenMonitor } from "@/figma-operator/demo/ListenMonitor";
import * as I from "../../components/icons";
import { OperatorLayout } from "../../components/operator/OperatorLayout";
import {
  DomainLabel,
  ErrorState,
  LoadingRows,
  Mono,
  PageTitle,
  Panel,
  QualityBadge,
  useQuery,
} from "../../components/operator/parts";
import { cx, linkBtn } from "../../components/ui";
import { fmtTs, sourceById, summarize } from "../../observations";
import { useOperator } from "../../operator-context";

export function Overview() {
  const { operator: OPERATOR, sources: SOURCES, timeZone } = useOperator();
  const load = useCallback(
    () => summarize(OPERATOR.organizationId),
    [OPERATOR.organizationId],
  );
  const q = useQuery(load);
  const d = q.status === "ok" ? q.data : null;
  const cells: [string, number | undefined, string, string][] = [
    ["Total observasi", d?.total, "/operator/observations", "semua domain"],
    [
      "Keanekaragaman hayati",
      d?.biodiversity,
      "/operator/observations?domain=biodiversity",
      "biodiversity",
    ],
    [
      "Risiko lingkungan",
      d?.environmental_risk,
      "/operator/observations?domain=environmental_risk",
      "environmental_risk",
    ],
    [
      "Belum ditinjau",
      d?.unreviewed,
      "/operator/observations?quality=unreviewed",
      "unreviewed",
    ],
  ];
  return (
    <OperatorLayout path="/operator/overview" crumbs={[{ label: "Ringkasan" }]}>
      <PageTitle
        title="Ringkasan observasi"
        sub={
          <>
            Rekaman tersimpan untuk{" "}
            <span className="text-fg">{OPERATOR.orgName}</span>. Angka dihitung
            dari observasi tersimpan dalam organisasi yang Anda akses.
          </>
        }
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

      {q.status === "error" ? (
        <ErrorState error={q.error} retry={q.retry} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-5">
            <section
              aria-label="Jumlah observasi"
              className="grid grid-cols-2 overflow-hidden rounded-md border border-line bg-surface md:grid-cols-4"
            >
              {cells.map(([label, n, href, hint], i) => (
                <a
                  key={label}
                  href={href}
                  className={cx(
                    "block px-4 py-3.5 hover:bg-bg",
                    i % 2 === 1 && "border-l border-line",
                    i > 1 && "border-t border-line md:border-t-0",
                    i === 2 && "md:border-l",
                  )}
                >
                  <p className="text-xs text-muted">{label}</p>
                  <p className="tnum mt-1 h-8 text-2xl font-semibold tracking-[-0.02em] text-ink">
                    {n ?? (
                      <span className="inline-block h-6 w-8 animate-pulse rounded bg-line align-middle motion-reduce:animate-none" />
                    )}
                  </p>
                  <Mono className="block truncate text-xs text-muted">
                    {hint}
                  </Mono>
                </a>
              ))}
            </section>

            <ListenMonitor />
            <Panel
              title="Observasi terakhir diterima"
              aside={
                <a
                  href="/operator/observations"
                  className="inline-flex items-center gap-1 rounded text-[13px] font-medium whitespace-nowrap text-brand hover:underline"
                >
                  Semua observasi
                  <I.ArrowRight className="size-3.5" />
                </a>
              }
              flush
            >
              {q.status === "loading" ? (
                <LoadingRows rows={5} />
              ) : d?.recent.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm">
                  <p className="font-medium">
                    Belum ada observasi untuk organisasi ini
                  </p>
                  <p className="mt-1 text-muted">
                    Rekaman akan muncul setelah dicatat manual atau diimpor.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {d?.recent.map((o) => (
                    <li key={o.id}>
                      <a
                        href={`/operator/observations/${o.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-bg"
                      >
                        <Mono className="min-w-0 shrink-0 font-medium text-ink">
                          <span title={o.id}>{o.id.slice(0, 8)}…</span>
                        </Mono>
                        <span className="order-2 basis-full sm:order-none sm:basis-auto sm:w-44">
                          <DomainLabel d={o.domain} />
                        </span>
                        <span className="order-last min-w-0 basis-full truncate text-xs text-muted md:order-none md:basis-0 md:flex-1">
                          <Mono className="text-xs">
                            {sourceById(o.sourceId, SOURCES)?.code ??
                              o.sourceCode}
                          </Mono>{" "}
                          · diterima{" "}
                          <Mono className="tnum text-xs">
                            {fmtTs(o.receivedAt, timeZone)}
                          </Mono>
                        </span>
                        <span className="ml-auto">
                          <QualityBadge q={o.quality} />
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <aside className="space-y-5">
            <Panel title="Cara membaca waktu">
              <dl className="space-y-2.5 text-[13px] leading-5">
                <div>
                  <dt className="font-medium">Waktu observasi</dt>
                  <dd className="text-muted">
                    Kapan kejadian diamati menurut sumber. Bisa tidak diketahui;
                    alasannya ikut disimpan.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Waktu diterima</dt>
                  <dd className="text-muted">
                    Kapan rekaman masuk ke Auvrion. Filter rentang waktu memakai
                    waktu ini.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium">Impor historis</dt>
                  <dd className="text-muted">
                    Arsip lama yang baru didigitalkan; selisih kedua waktu bisa
                    bertahun-tahun.
                  </dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-line pt-2.5 text-xs text-muted">
                Waktu mengikuti pilihan zona Operator: {timeZone} (UTC+
                {timeZone === "WIB" ? "7" : timeZone === "WITA" ? "8" : "9"}).
              </p>
            </Panel>
            <Panel
              title="Kesehatan sumber"
              aside={
                <span className="rounded border border-line px-1.5 py-px text-xs text-muted">
                  Tidak tersedia
                </span>
              }
            >
              <p className="text-[13px] leading-5 text-muted">
                Kontrak API saat ini tidak menyediakan status koneksi maupun
                kesegaran sumber, jadi tidak ada indikator
                &ldquo;langsung&rdquo;. Angka di sini hanya mencerminkan rekaman
                yang sudah tersimpan.
              </p>
            </Panel>
            <Panel title="Lingkup peran operator">
              <ul className="space-y-1.5 text-[13px] leading-5 text-muted">
                <li>
                  Memantau, menelusuri, dan mencatat observasi manual dalam
                  organisasi Anda.
                </li>
                <li>
                  Domain &ldquo;Risiko lingkungan&rdquo; bukan konfirmasi
                  kebakaran. Penilaian, penugasan, dan keputusan akhir dilakukan
                  supervisor.
                </li>
              </ul>
            </Panel>
          </aside>
        </div>
      )}
    </OperatorLayout>
  );
}
