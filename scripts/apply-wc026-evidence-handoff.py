#!/usr/bin/env python3
"""Guarded WC026 evidence display/handoff patch for the owner's current working tree.
No direct coordinates, DB migrations, device protocols, remote writes, or external requests.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import shutil
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]

DISPLAY_FILE = 'src/figma-operator/gis/observation-evidence-display.ts'
DISPLAY_TEST = 'src/figma-operator/gis/observation-evidence-display.test.ts'
EVIDENCE_FILE = 'src/server/workflow/observation-evidence.ts'

DISPLAY = r'''/** Read-only presentation helpers. Never modify the stored decimal or UTC timestamp. */
import type { IndonesianTimeZone } from "@/figma-operator/time";

const ZONE_NAMES: Record<IndonesianTimeZone, string> = {
  WIB: "Asia/Jakarta",
  WITA: "Asia/Makassar",
  WIT: "Asia/Jayapura",
};

/** Preserve every significant decimal digit while removing DB NUMERIC(16,6) padding. */
export function formatMeasurementValue(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "—";
  const value = String(raw).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return value || "—";
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fractional = (match[3] ?? "").replace(/0+$/, "");
  return `${match[1]}${whole}${fractional ? `,${fractional}` : ""}`;
}

/** UTC -> human-readable civil time. Unknown/invalid inputs never silently become now. */
export function formatEvidenceTime(
  value: Date | string | null | undefined,
  zone: IndonesianTimeZone = "WITA",
): string {
  if (value === null || value === undefined || value === "") return "Tidak tersedia";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Tidak tersedia";
  const text = new Intl.DateTimeFormat("id-ID", {
    timeZone: ZONE_NAMES[zone],
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${text} ${zone}`;
}

export function sourceKindLabel(kind: string): string {
  switch (kind) {
    case "manual": return "Input manual Operator";
    case "listen_device": return "Perangkat IoT LISTEN (bioakustik)";
    case "prevent_device": return "Perangkat IoT PREVENT (lingkungan)";
    case "visual_device": return "Perangkat visual";
    case "external_provider": return "Penyedia data eksternal";
    default: return "Sumber belum diklasifikasikan";
  }
}

export function ingestionModeLabel(mode: string): string {
  switch (mode) {
    case "simulation": return "Simulasi — bukan data lapangan nyata";
    case "historical": return "Historis";
    case "live": return "Terkini (belum tentu terverifikasi)";
    default: return "Mode belum diketahui";
  }
}
'''

DISPLAY_TEST_TEXT = r'''import { describe, expect, it } from "vitest";
import {
  formatEvidenceTime,
  formatMeasurementValue,
  ingestionModeLabel,
  sourceKindLabel,
} from "./observation-evidence-display";

describe("WC026 evidence presentation", () => {
  it("removes numeric scale zeros without rounding away source precision", () => {
    expect(formatMeasurementValue("34.500000")).toBe("34,5");
    expect(formatMeasurementValue("0.000001")).toBe("0,000001");
    expect(formatMeasurementValue("34.000000")).toBe("34");
    expect(formatMeasurementValue("-2.250000")).toBe("-2,25");
    expect(formatMeasurementValue(null)).toBe("—");
  });
  it("formats one UTC instant in all three Indonesian zones", () => {
    const t = "2026-10-26T05:00:00.000Z";
    expect(formatEvidenceTime(t, "WIB")).toContain("12.00 WIB");
    expect(formatEvidenceTime(t, "WITA")).toContain("13.00 WITA");
    expect(formatEvidenceTime(t, "WIT")).toContain("14.00 WIT");
    expect(formatEvidenceTime("bad-date")).toBe("Tidak tersedia");
  });
  it("distinguishes manual/source simulation from device evidence", () => {
    expect(sourceKindLabel("manual")).toContain("manual");
    expect(sourceKindLabel("prevent_device")).toContain("PREVENT");
    expect(ingestionModeLabel("simulation")).toContain("Simulasi");
  });
});
'''

EVIDENCE = r'''import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  environmentalMeasurements,
  observationProvenance,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";

/** A minimum-necessary, case-linked, org-scoped evidence projection.
 * NO coordinates, private URLs, audio, sensor credentials or raw payloads.
 * Only call AFTER verifying Supervisor case or Ranger task permission.
 */
export type CaseObservationEvidence = {
  sourceKind: string;
  ingestionMode: string;
  sourceRecordId: string | null;
  acquisitionMethod: string | null;
  attribution: string | null;
  limitations: string[];
  hasCoordinates: boolean;
  measurements: Array<{
    id: string;
    kind: string;
    measuredValue: string;
    unit: string;
    measuredAt: Date | null;
    quality: string;
  }>;
};

export async function getCaseObservationEvidence(
  organizationId: string,
  observationIds: string[],
): Promise<Map<string, CaseObservationEvidence>> {
  const ids = [...new Set(observationIds)].slice(0, 50);
  const result = new Map<string, CaseObservationEvidence>();
  if (ids.length === 0) return result;
  const db = getDb();
  const rows = await db
    .select({
      id: observations.id,
      sourceKind: observationSources.kind,
      ingestionMode: observations.ingestionMode,
      sourceRecordId: observations.sourceRecordId,
      hasCoordinates: sql<boolean>`${observations.latitude} IS NOT NULL`,
      acquisitionMethod: observationProvenance.acquisitionMethod,
      attribution: observationProvenance.attribution,
      limitations: observationProvenance.limitations,
    })
    .from(observations)
    .innerJoin(
      observationSources,
      and(
        eq(observationSources.id, observations.sourceId),
        eq(observationSources.organizationId, observations.organizationId),
      ),
    )
    .leftJoin(observationProvenance, eq(observationProvenance.observationId, observations.id))
    .where(and(eq(observations.organizationId, organizationId), inArray(observations.id, ids)));

  for (const row of rows) {
    result.set(row.id, {
      sourceKind: row.sourceKind,
      ingestionMode: row.ingestionMode,
      sourceRecordId: row.sourceRecordId,
      hasCoordinates: row.hasCoordinates,
      acquisitionMethod: row.acquisitionMethod,
      attribution: row.attribution,
      limitations: Array.isArray(row.limitations) ? row.limitations : [],
      measurements: [],
    });
  }
  if (result.size === 0) return result;

  const measurementRows = await db
    .select({
      observationId: environmentalMeasurements.observationId,
      id: environmentalMeasurements.id,
      kind: environmentalMeasurements.kind,
      measuredValue: environmentalMeasurements.measuredValue,
      unit: environmentalMeasurements.unit,
      measuredAt: environmentalMeasurements.measuredAt,
      quality: environmentalMeasurements.quality,
    })
    .from(environmentalMeasurements)
    .innerJoin(
      observations,
      and(
        eq(observations.id, environmentalMeasurements.observationId),
        eq(observations.organizationId, organizationId),
      ),
    )
    .where(inArray(environmentalMeasurements.observationId, [...result.keys()]))
    .orderBy(asc(environmentalMeasurements.observationId), asc(environmentalMeasurements.measuredAt))
    .limit(500);

  for (const measurement of measurementRows) {
    const item = result.get(measurement.observationId);
    if (item && item.measurements.length < 6) {
      item.measurements.push({
        id: measurement.id,
        kind: measurement.kind,
        measuredValue: measurement.measuredValue,
        unit: measurement.unit,
        measuredAt: measurement.measuredAt,
        quality: measurement.quality,
      });
    }
  }
  return result;
}
'''

PATCHES: dict[str, list[tuple[str,str]]] = {}

def edit(path: str, old: str, new: str) -> None:
  PATCHES.setdefault(path, []).append((old, new))

OBS_DETAIL = 'src/figma-operator/screens/operator/ObservationDetail.tsx'
ENV_ADVISORY = 'src/figma-operator/demo/EnvironmentalAdvisory.tsx'
SUP_QUERY = 'src/server/workflow/workspace-queries.ts'
SUP_UI = 'src/app/supervisor/decisions/[id]/page.tsx'
RANGER_QUERY = 'src/server/ranger/ranger-case-observations.ts'
RANGER_UI = 'src/app/ranger/tasks/[id]/page.tsx'

edit(OBS_DETAIL,
     'import { EnvironmentalAdvisory } from "@/figma-operator/demo/EnvironmentalAdvisory";',
     'import { EnvironmentalAdvisory } from "@/figma-operator/demo/EnvironmentalAdvisory";\nimport { formatMeasurementValue } from "@/figma-operator/gis/observation-evidence-display";')
edit(OBS_DETAIL,
     'Rekaman sumber <Mono className="text-fg">{o.sourceRecordId}</Mono>',
     'ID rekaman sumber <Mono className="text-fg">{o.sourceRecordId}</Mono>')
edit(OBS_DETAIL,
     '''              <KV k="ID rekaman sumber">
                <Mono>{o.sourceRecordId}</Mono>
              </KV>''',
     '''              <KV k="ID rekaman sumber">
                <Mono>{o.sourceRecordId}</Mono>
                <span className="mt-1 block text-xs text-muted">
                  ID unik pada sumber data; untuk input manual bukan berkas rekaman suara.
                </span>
              </KV>''')
edit(OBS_DETAIL,
     'value: String(m.measuredValue),',
     'value: formatMeasurementValue(m.measuredValue),')
edit(OBS_DETAIL,
     '''              measurements={o.measurements.map((m) => ({''',
     '''              sourceSummary={`${o.sourceCode} · ${o.provenance.acquisitionMethod ?? "metode tidak diketahui"} · ${MODE[o.ingestionMode]}`}
              measurements={o.measurements.map((m) => ({''')
edit(OBS_DETAIL,
     '''                              {m.measuredValue}
''',
     '''                              {formatMeasurementValue(m.measuredValue)}
''')
edit(OBS_DETAIL,
     '    unknowns.push("Catatan lisensi tidak dicantumkan sumber.");',
     '    unknowns.push("Catatan lisensi belum tersedia melalui API; statusnya pada sumber belum bisa dipastikan.");')
edit(OBS_DETAIL,
     'Belum tersedia pada respons API WC-008',
     'Belum tersedia melalui API observasi')

edit(OBS_DETAIL,
     '''              Operator tidak mengubah kualitas. Alur peninjauan menunggu
              integrasi WC-012.''',
     '''              Ini adalah kualitas data observasi, bukan status Case. Transisi
              Operator atau keputusan Supervisor tidak otomatis memvalidasi pengukuran.
              Penetapan kualitas memerlukan prosedur review terotorisasi.''')
edit(OBS_DETAIL,
     '''                    Titik tersimpan di server, tetapi API tidak mengembalikan
                    koordinat presisi sesuai kebijakan privasi lokasi.''',
     '''                    Titik tersimpan di server. Koordinat presisi dan mini-map
                    titik tidak dibuka oleh API ini sesuai kebijakan privasi.
                    Operational Zone penugasan bukan bukti lokasi titik berada di dalam zona.''')

edit(ENV_ADVISORY,
     'import { useOperator } from "@/figma-operator/operator-context";',
     'import { useOperator } from "@/figma-operator/operator-context";\nimport { formatEvidenceTime } from "@/figma-operator/gis/observation-evidence-display";')
edit(ENV_ADVISORY,
     '''  measurements,
}: {
  observationId: string;
  measurements: { label: string; value: string; unit?: string }[];
}) {
  const { operator } = useOperator();''',
     '''  measurements,
  sourceSummary,
}: {
  observationId: string;
  measurements: { label: string; value: string; unit?: string }[];
  sourceSummary: string;
}) {
  const { operator, timeZone } = useOperator();''')
edit(ENV_ADVISORY,
     '''            {new Date(external.retrievedAtUtc).toLocaleString("id-ID", {
              timeZone: "Asia/Makassar",
            })}{" "}
            WITA''',
     '''            {formatEvidenceTime(external.retrievedAtUtc, timeZone)}''')
edit(ENV_ADVISORY,
     '''                  Berlaku: {forecast.utc} (UTC)''',
     '''                  Berlaku: {formatEvidenceTime(forecast.utc, timeZone)}''')
edit(ENV_ADVISORY,
     '''                {nasaData.count} deteksi termal ({nasaData.sensor},{" "}
                {nasaData.windowDays} hari).
                <span className="block text-xs text-muted">
                  Deteksi terakhir:{" "}
                  {nasaData.latestUtc ?? "tidak ada deteksi tercatat"}.
                </span>''',
     '''                {nasaData.count} titik anomali termal dalam {nasaData.windowDays} hari.
                <span className="block text-xs text-muted">
                  Sensor: {nasaData.sensor.replaceAll("_", " · ")} · NASA FIRMS (VIIRS NRT).
                </span>
                <span className="block text-xs text-muted">
                  {nasaData.latestUtc
                    ? `Deteksi terakhir: ${formatEvidenceTime(nasaData.latestUtc, timeZone)}`
                    : "Tidak ada deteksi tercatat pada cakupan dan periode ini."}
                </span>''')
edit(ENV_ADVISORY,
     '''              Pengukuran dari observasi tersimpan (bukan data BMKG/NASA)''',
     '''              Pengukuran observasi tersimpan (bukan nilai BMKG/NASA)''')
edit(ENV_ADVISORY,
     '''            </p>
            <dl className="grid grid-cols-2 gap-2">''',
     '''            </p>
            <p className="mb-2 text-xs text-muted">
              Asal data observasi: {sourceSummary}. Perangkat IoT hanya ditampilkan jika data perangkat benar-benar telah masuk melalui ingestion.
            </p>
            <dl className="grid grid-cols-2 gap-2">''')

edit(SUP_QUERY,
     'import "server-only";',
     'import "server-only";\n\nimport { getCaseObservationEvidence } from "@/server/workflow/observation-evidence";')
edit(SUP_QUERY,
     '  return { record, observations: links, events, tasks };',
     '''  // Projection is strictly tied to the already tenant-scoped, case-linked IDs.
  // Never attach coordinates or private media URLs to Supervisor responses.
  const evidence = await getCaseObservationEvidence(
    organizationId,
    links.map((item) => item.id),
  );
  return {
    record,
    observations: links.map((item) => ({
      ...item,
      evidence: evidence.get(item.id) ?? null,
    })),
    events,
    tasks,
  };''')

edit(SUP_UI,
     'import { CaseActionForm } from "@/components/supervisor/CaseActionForm";',
     '''import { CaseActionForm } from "@/components/supervisor/CaseActionForm";
import {
  formatEvidenceTime,
  formatMeasurementValue,
  ingestionModeLabel,
  sourceKindLabel,
} from "@/figma-operator/gis/observation-evidence-display";''')
edit(SUP_UI,
     '''                    <p className="mt-1 text-xs text-muted">{o.linkReason}</p>
                    <p className="mt-1 text-xs text-muted">
                      Lokasi presisi tidak dibuka melalui workspace keputusan.
                    </p>''',
     '''                    <p className="mt-1 text-xs text-muted">{o.linkReason}</p>
                    {o.evidence && (
                      <div className="mt-3 space-y-2 rounded-md border border-line bg-bg p-3 text-xs leading-5">
                        <p className="font-semibold text-ink">Bukti observasi untuk keputusan</p>
                        <p>
                          Asal: {sourceKindLabel(o.evidence.sourceKind)} · {ingestionModeLabel(o.evidence.ingestionMode)}
                        </p>
                        <p>ID rekaman sumber: {o.evidence.sourceRecordId ?? "Tidak tersedia"}</p>
                        <p>Metode akuisisi: {o.evidence.acquisitionMethod ?? "Belum diketahui"}</p>
                        {o.evidence.measurements.length > 0 && (
                          <ul className="space-y-1 border-t border-line pt-2">
                            {o.evidence.measurements.map((m) => (
                              <li key={m.id}>
                                {m.kind === "air_temperature" ? "Suhu udara" : m.kind === "relative_humidity" ? "Kelembapan relatif" : m.kind === "pm2_5" ? "PM2.5" : m.kind}: {formatMeasurementValue(m.measuredValue)} {m.unit}
                                {" · "}{formatEvidenceTime(m.measuredAt, "WITA")}
                                {" · kualitas: "}{m.quality}
                              </li>
                            ))}
                          </ul>
                        )}
                        {o.evidence.attribution && <p>Atribusi: {o.evidence.attribution}</p>}
                        {o.evidence.limitations.length > 0 && (
                          <div className="border-t border-line pt-2">
                            <p className="font-medium">Keterbatasan sumber</p>
                            <ul className="list-disc pl-4">
                              {[...new Set(o.evidence.limitations)].map((note) => <li key={note}>{note}</li>)}
                            </ul>
                          </div>
                        )}
                        <p className="text-muted">
                          {o.evidence.hasCoordinates
                            ? "Titik tersimpan, koordinat presisi dilindungi."
                            : "Titik belum diketahui."}{" "}
                          Zona operasional adalah area tugas, bukan koordinat kejadian terverifikasi.
                        </p>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      Lokasi presisi tidak dibuka melalui workspace keputusan. BMKG/NASA pada halaman Operator adalah referensi wilayah, bukan pengukuran sensor dari observasi ini.
                    </p>''')

edit(RANGER_QUERY,
     'import "server-only";',
     'import "server-only";\n\nimport { getCaseObservationEvidence } from "@/server/workflow/observation-evidence";')
edit(RANGER_QUERY,
     '''  return result;
}''',
     '''  // Authorization above requires the current assigned Ranger; no cross-task lookup.
  // Evidence projection excludes coordinates, private URLs, and device credentials.
  const evidence = await getCaseObservationEvidence(
    organizationId,
    result.map((item) => item.id),
  );
  return result.map((item) => ({
    ...item,
    evidence: evidence.get(item.id) ?? null,
  }));
}''')

edit(RANGER_UI,
     'import { RangerIcon } from "@/components/ranger/RangerIcons";',
     '''import { RangerIcon } from "@/components/ranger/RangerIcons";
import {
  formatEvidenceTime,
  formatMeasurementValue,
  ingestionModeLabel,
  sourceKindLabel,
} from "@/figma-operator/gis/observation-evidence-display";''')
edit(RANGER_UI,
     '''                        Diterima {formattedDate(observation.receivedAt)} WITA
                      </p>''',
     '''                        Diterima {formattedDate(observation.receivedAt)} WITA
                      </p>
                      {observation.evidence && (
                        <div className="mt-2 space-y-1 rounded-md border border-line bg-bg p-2.5 text-xs leading-5">
                          <p>
                            Sumber: {sourceKindLabel(observation.evidence.sourceKind)} · {ingestionModeLabel(observation.evidence.ingestionMode)}
                          </p>
                          {observation.evidence.measurements.map((m) => (
                            <p key={m.id}>
                              {m.kind === "air_temperature" ? "Suhu udara" : m.kind === "relative_humidity" ? "Kelembapan relatif" : m.kind === "pm2_5" ? "PM2.5" : m.kind}: {formatMeasurementValue(m.measuredValue)} {m.unit}
                              {" · "}{formatEvidenceTime(m.measuredAt, "WITA")}
                            </p>
                          ))}
                          {[...new Set(observation.evidence.limitations)].slice(0, 3).map((note) => (
                            <p key={note} className="text-muted">Batasan: {note}</p>
                          ))}
                          <p className="text-muted">Tidak ada koordinat presisi atau berkas privat dalam ringkasan ini. Hubungi Supervisor jika tugas membutuhkan akses lokasi khusus.</p>
                        </div>
                      )}''')
edit(RANGER_UI,
     '''                {zone ?? "Sesuai instruksi Supervisor"}
              </dd>''',
     '''                {zone ?? "Sesuai instruksi Supervisor"}
              </dd>
              <p className="mt-1 text-xs text-muted">Operational Zone adalah area kerja penugasan</p>''')

NEW = {DISPLAY_FILE: DISPLAY, DISPLAY_TEST: DISPLAY_TEST_TEXT, EVIDENCE_FILE: EVIDENCE}

def normalize(value: str) -> str:
  return value.replace('\r\n','\n')

def plan(root: Path) -> tuple[dict[Path, bytes], list[Path]]:
  outputs: dict[Path, bytes] = {}
  changed: list[Path] = []
  for relative, replacements in PATCHES.items():
    target = root / relative
    if not target.is_file():
      raise RuntimeError(f'Missing source: {relative} (requires current Auvrion repository)')
    original = normalize(target.read_text(encoding='utf-8'))
    result = original
    for before, after in replacements:
      before, after = normalize(before), normalize(after)
      n = result.count(before)
      if n != 1:
        raise RuntimeError(f'Anchor count {n}, expected 1: {relative}: {before[:95]!r}. NO FILES CHANGED.')
      result = result.replace(before, after, 1)
    outputs[target] = result.encode('utf-8')
    if result != original: changed.append(target)
  for relative, content in NEW.items():
    target = root / relative
    if target.exists():
      raise RuntimeError(f'New WC026 file already exists: {relative}. Refusing overwrite.')
    outputs[target] = normalize(content).encode('utf-8')
    changed.append(target)
  return outputs, changed

def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--root', type=Path, default=Path.cwd(), help='Auvrion repository root')
  action = parser.add_mutually_exclusive_group(required=True)
  action.add_argument('--check', action='store_true', help='Preflight only; no writes')
  action.add_argument('--apply', action='store_true', help='Back up originals and apply')
  args = parser.parse_args()
  root = args.root.resolve()
  if not (root / 'package.json').is_file() or not (root / 'src/server').is_dir():
    print('ERROR: --root is not Auvrion repository root',file=sys.stderr)
    return 2
  try:
    outputs, changed = plan(root)
    print(f'WC026 preflight OK: {len(changed)} target files.')
    for path in changed: print('  ',path.relative_to(root))
    if args.check:
      print('CHECK ONLY. No files changed.');return 0
    git_dir = root / '.git'
    if not git_dir.exists():
      raise RuntimeError('Git metadata not found; refusing modifications without backup.')
    backup = git_dir / 'wc026-evidence-backup' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    if backup.exists():
      raise RuntimeError('Backup destination already exists')
    # All replacements validated before any write. Backup full originals before edits.
    for target in outputs:
      if target.exists():
        original = backup / target.relative_to(root)
        original.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, original)
    written: list[Path] = []
    try:
      for target, payload in outputs.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.wc026tmp')
        temporary.write_bytes(payload)
        temporary.replace(target)
        written.append(target)
    except Exception:
      for target in reversed(written):
        stored = backup / target.relative_to(root)
        if stored.exists():
          shutil.copy2(stored, target)
        elif target.exists():
          target.unlink()
      raise
    print('APPLIED. Existing file backups:', backup)
    return 0
  except Exception as e:
    print(f'ERROR: {e}',file=sys.stderr)
    return 1

if __name__ == '__main__':
  raise SystemExit(main())
