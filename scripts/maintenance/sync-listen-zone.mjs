/** Create/update an auditable, bounded operational area from a verified LISTEN installation. */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const execute = process.argv.includes("--execute");
const backupFlag = process.argv.find((a) => a.startsWith("--backup="));
const backup = backupFlag?.slice("--backup=".length);
const sourceFlag = process.argv.find((a) => a.startsWith("--source="));
const sourceCode = sourceFlag?.slice("--source=".length) || "listen-esp32-01";
const approvedSources = new Set(["listen-esp32-01"]);
const cutoffZone = "WC013-DEMO";
const zoneCode = "LISTEN-ESP32-01-AREA";
const radiusMeters = 500;
function fail(message) {
  throw new Error(message);
}
if (!approvedSources.has(sourceCode))
  fail("Sumber belum ada di whitelist; periksa script untuk sumber lain.");
if (!process.env.DATABASE_URL) fail("DATABASE_URL diperlukan");
const dburl = new URL(process.env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1", "::1"].includes(dburl.hostname) ||
  dburl.pathname !== "/auvrion_dev"
)
  fail("Skrip ini hanya untuk DB auvrion_dev lokal, bukan database hosting");
if (execute) {
  if (!backup) fail("Sertakan --backup=../file.backup dari pg_dump");
  const b = await stat(resolve(backup)).catch(() => null);
  if (!b?.isFile() || b.size < 1024)
    fail("Backup database tidak ditemukan atau kosong");
}
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const res = await db.query(
    `
    SELECT l.device_id, l.organization_id, l.location_label,
           l.latitude, l.longitude, l.verified_at, l.disclosure_approved,
           d.status, s.code
      FROM listen_device_installations l
      JOIN ingestion_devices d ON d.id=l.device_id AND d.organization_id=l.organization_id
      JOIN observation_sources s ON s.id=d.source_id AND s.organization_id=d.organization_id
     WHERE s.code=$1 AND d.status='active' AND l.disclosure_approved=true
     ORDER BY l.verified_at DESC LIMIT 1`,
    [sourceCode],
  );
  if (res.rows.length !== 1)
    fail(
      `Ditemukan ${res.rows.length} instalasi approved/active. Harus tepat satu; jangan tebak lokasi.`,
    );
  const installation = res.rows[0];
  if (
    !Number.isFinite(Number(installation.latitude)) ||
    !Number.isFinite(Number(installation.longitude))
  )
    fail("Koordinat instalasi tidak valid.");
  const old = await db.query(
    "SELECT id,code,name FROM operational_zones WHERE organization_id=$1 AND code=$2",
    [installation.organization_id, cutoffZone],
  );
  let oldUsed = 0;
  if (old.rows.length) {
    const usage = await db.query(
      `SELECT count(*)::int n FROM observation_zone_matches m
      JOIN zone_geometry_versions v ON v.id=m.zone_geometry_version_id
     WHERE v.zone_id=$1`,
      [old.rows[0].id],
    );
    oldUsed = usage.rows[0].n;
  }
  console.log(
    JSON.stringify(
      {
        mode: execute ? "EXECUTE" : "AUDIT_ONLY",
        sourceCode,
        deviceId: installation.device_id,
        verifiedAt: installation.verified_at,
        locationLabel: installation.location_label,
        latitude: installation.latitude,
        longitude: installation.longitude,
        note: "Koordinat ini adalah lokasi instalasi yang terakhir disetujui, bukan GPS langsung.",
        operationalAreaMeters: radiusMeters,
        code: zoneCode,
        oldDemoZone: old.rows[0] || null,
        oldGeometryMatches: oldUsed,
      },
      null,
      2,
    ),
  );
  if (!execute) {
    console.log(
      "Tidak ada perubahan; pastikan instalasi tersebut masih di tempat yang benar.",
    );
  } else {
    await db.query("BEGIN");
    try {
      const z = await db.query(
        `INSERT INTO operational_zones (organization_id,code,name)
        VALUES ($1,$2,$3) ON CONFLICT (organization_id,code)
        DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [
          installation.organization_id,
          zoneCode,
          `Area Operasional LISTEN ESP32-01`,
        ],
      );
      const zoneId = z.rows[0].id;
      const last = await db.query(
        `SELECT geometry_version,
         ST_Distance(ST_Centroid(boundary)::geography, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) distance_meters
        FROM zone_geometry_versions WHERE zone_id=$1 ORDER BY geometry_version DESC LIMIT 1`,
        [zoneId, installation.longitude, installation.latitude],
      );
      if (!last.rows.length || Number(last.rows[0].distance_meters) > 20) {
        const next = (last.rows[0]?.geometry_version || 0) + 1;
        await db.query(
          `INSERT INTO zone_geometry_versions
          (organization_id,zone_id,geometry_version,boundary,reference_source)
          VALUES($1,$2,$3,
          ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,$6)::geometry),$7)`,
          [
            installation.organization_id,
            zoneId,
            next,
            installation.longitude,
            installation.latitude,
            radiusMeters,
            `verified-listen-installation:${installation.device_id};verified-at:${new Date(installation.verified_at).toISOString()}`,
          ],
        );
        console.log(`Zona diposisikan pada versi geometri ${next}.`);
      } else {
        console.log(
          "Zona sudah selaras dengan lokasi tercatat (pergeseran <=20 m).",
        );
      }
      if (old.rows.length) {
        if (oldUsed === 0) {
          await db.query(
            "DELETE FROM zone_geometry_versions WHERE zone_id=$1",
            [old.rows[0].id],
          );
          await db.query("DELETE FROM operational_zones WHERE id=$1", [
            old.rows[0].id,
          ]);
          console.log("WC013-DEMO dihapus dari database.");
        } else
          console.log(
            `WC013-DEMO masih memiliki ${oldUsed} relasi observasi-geometri; tidak dihapus, tetapi dapat disembunyikan dari UI.`,
          );
      }
      await db.query("COMMIT");
      console.log(
        "Zona operasional kini siap dipilih pada formulir Supervisor.",
      );
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await db.end();
}
