/** Auvrion local-dev audio cleanup, explicit cutoff 2026-10-30 00:00 WITA. */

import { createHash } from "node:crypto";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Client } from "pg";

const CUTOFF = "2026-10-29T16:00:00.000Z";
const execute = process.argv.includes("--execute");
const backupFlag = process.argv.find((x) => x.startsWith("--backup="));
const BACKUP = backupFlag?.slice("--backup=".length);
const audioName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$/i;
const fatal = (message) => {
  throw new Error(message);
};
if (!process.env.DATABASE_URL)
  fatal("DATABASE_URL wajib disediakan via --env-file=.env.local");
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname))
  fatal(
    "Hanya database localhost yang diizinkan; jangan jalankan pada hosting",
  );
if (url.pathname !== "/auvrion_dev")
  fatal(`Database harus auvrion_dev, bukan ${url.pathname}`);
if (execute && !BACKUP)
  fatal("Wajib --backup=../namafile.backup setelah pg_dump berhasil");
if (execute) {
  const b = await stat(resolve(BACKUP)).catch(() => null);
  if (!b?.isFile() || b.size < 1024)
    fatal("File backup PostgreSQL tidak ada atau terlalu kecil");
}
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const dbName = (await client.query("select current_database() AS name"))
    .rows[0]?.name;
  if (dbName !== "auvrion_dev") fatal(`DB mismatch: ${dbName}`);
  const exists = async (table) =>
    (await client.query("SELECT to_regclass($1) AS obj", [`public.${table}`]))
      .rows[0]?.obj !== null;
  if (
    !(await exists("evidence_media")) ||
    !(await exists("ingestion_recordings"))
  )
    fatal(
      "Tabel evidence_media / ingestion_recordings tidak lengkap. Jangan tebak schema.",
    );

  const { rows: oldMedia } = await client.query(
    `
    SELECT m.id, m.storage_key, m.sha256, m.created_at, m.organization_id,
           (SELECT COUNT(*)::int FROM evidence_links l WHERE l.media_id=m.id) AS link_count
      FROM evidence_media m
     WHERE m.created_at < $1::timestamptz AND m.mime_type IN ('audio/wav','audio/wave','audio/x-wav')
     ORDER BY m.created_at ASC`,
    [CUTOFF],
  );
  const { rows: oldIngest } = await client.query(
    `
    SELECT id, storage_key, audio_sha256 AS sha256, created_at, observation_id,
           organization_id
      FROM ingestion_recordings
     WHERE created_at < $1::timestamptz
     ORDER BY created_at ASC`,
    [CUTOFF],
  );
  // Never remove a file still referenced by a media / ingestion record dated on or after cutoff.
  const { rows: newMediaKeys } = await client.query(
    `
    SELECT storage_key FROM evidence_media
     WHERE created_at >= $1::timestamptz`,
    [CUTOFF],
  );
  const { rows: newDeviceKeys } = await client.query(
    `
    SELECT storage_key FROM ingestion_recordings
     WHERE created_at >= $1::timestamptz`,
    [CUTOFF],
  );
  const keepKeys = new Set(
    [...newMediaKeys, ...newDeviceKeys].map((x) => x.storage_key),
  );
  const affected = new Map();
  for (const row of [...oldMedia, ...oldIngest]) {
    if (keepKeys.has(row.storage_key))
      fatal(
        `Storage key lama juga dipakai pada data 30 Oktober: ${row.storage_key}`,
      );
    if (!audioName.test(row.storage_key))
      fatal(
        `Storage key tidak sesuai nama WAV yang diharapkan: ${row.storage_key}`,
      );
    const existing = affected.get(row.storage_key);
    if (
      existing?.sha256 &&
      row.sha256 &&
      existing.sha256.toLowerCase() !== row.sha256.toLowerCase()
    )
      fatal(`Checksum berbeda untuk storage key: ${row.storage_key}`);
    affected.set(row.storage_key, {
      key: row.storage_key,
      sha256: row.sha256 || existing?.sha256,
    });
  }
  const mediaIds = oldMedia.map((x) => x.id);
  const recordingIds = oldIngest.map((x) => x.id);
  const snapshotsExist = await exists("bioacoustic_analysis_snapshots");
  if (snapshotsExist) {
    const cols = (
      await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bioacoustic_analysis_snapshots'`,
      )
    ).rows.map((x) => x.column_name);
    if (!cols.includes("media_id"))
      fatal(
        "Tabel snapshot Perch tidak memiliki media_id. Audit schema manual dahulu.",
      );
  }
  // Fail closed if newer / unknown foreign-key tables reference media or ingestion records.
  const fkRows = (
    await client.query(`
    SELECT conrelid::regclass::text AS referencing_table, confrelid::regclass::text AS target_table
      FROM pg_constraint
     WHERE contype='f' AND confrelid IN ('public.evidence_media'::regclass, 'public.ingestion_recordings'::regclass)
  `)
  ).rows;
  for (const fk of fkRows) {
    const ref = fk.referencing_table.split(".").at(-1).replaceAll('"', "");
    const target = fk.target_table.split(".").at(-1).replaceAll('"', "");
    if (
      target === "evidence_media" &&
      ![
        "evidence_links",
        "evidence_upload_requests",
        "bioacoustic_analysis_snapshots",
      ].includes(ref)
    )
      fatal(`Dependensi tak dikenal: ${ref} -> ${target}`);
    if (target === "ingestion_recordings")
      fatal(`Dependensi tambahan rekaman: ${ref} -> ${target}`);
  }
  const snapshotCount =
    snapshotsExist && mediaIds.length
      ? Number(
          (
            await client.query(
              "SELECT count(*)::int AS n FROM bioacoustic_analysis_snapshots WHERE media_id=ANY($1::uuid[])",
              [mediaIds],
            )
          ).rows[0].n,
        )
      : 0;
  console.log(
    JSON.stringify(
      {
        mode: execute ? "EXECUTE" : "AUDIT_ONLY",
        cutoffWita: "2026-10-30 00:00 WITA",
        cutoffUtc: CUTOFF,
        database: dbName,
        oldEvidenceRows: oldMedia.length,
        oldIngestionRows: oldIngest.length,
        oldPerchSnapshots: snapshotCount,
        distinctWavFiles: affected.size,
        oldEvidence: oldMedia.map((x) => ({
          mediaId: x.id,
          createdAt: x.created_at,
          linkedObservations: x.link_count,
        })),
        oldDevice: oldIngest.map((x) => ({
          recordingId: x.id,
          observedReceiptAt: x.created_at,
          observationId: x.observation_id,
        })),
      },
      null,
      2,
    ),
  );
  if (!execute) {
    console.log(
      "Tidak ada perubahan. Siapkan pg_dump lalu jalankan --execute --backup=...",
    );
    process.exitCode = 0;
  } else {
    const root = process.env.PRIVATE_EVIDENCE_DIR;
    if (!root || !isAbsolute(root))
      fatal(
        "PRIVATE_EVIDENCE_DIR harus absolute path dan berisi WAV dari server ini.",
      );
    const realRoot = await realpath(root);
    if (realRoot !== resolve(root))
      fatal("PRIVATE_EVIDENCE_DIR tidak boleh symlink");
    // Check all files BEFORE DB commit; deleted metadata must not leave unexpected unverified files.
    for (const { key, sha256 } of affected.values()) {
      if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256))
        fatal(`Checksum kosong/tidak valid untuk ${key}`);
      const file = join(realRoot, key);
      const meta = await lstat(file).catch(() => null);
      if (!meta?.isFile() || meta.isSymbolicLink())
        fatal(`WAV tidak ditemukan / bukan file regular: ${key}`);
      const hash = createHash("sha256")
        .update(await readFile(file))
        .digest("hex");
      if (hash !== sha256.toLowerCase()) fatal(`SHA-256 mismatch: ${key}`);
    }
    // Make an offline WAV backup before changing any DB metadata.
    const backupAudioDir = join(
      dirname(resolve(BACKUP)),
      "auvrion_removed_wav_backup_before_20261030",
    );
    await mkdir(backupAudioDir, { recursive: true });
    for (const { key, sha256 } of affected.values()) {
      const destination = join(backupAudioDir, key);
      try {
        await copyFile(
          join(realRoot, key),
          destination,
          constants.COPYFILE_EXCL,
        );
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      const archivedHash = createHash("sha256")
        .update(await readFile(destination))
        .digest("hex");
      if (archivedHash !== sha256.toLowerCase())
        fatal(`Backup file SHA mismatch: ${key}`);
    }
    console.log(`Backup WAV lama disimpan di: ${backupAudioDir}`);
    await client.query("BEGIN");
    try {
      if (snapshotsExist && mediaIds.length)
        await client.query(
          "DELETE FROM bioacoustic_analysis_snapshots WHERE media_id=ANY($1::uuid[])",
          [mediaIds],
        );
      if (recordingIds.length)
        await client.query(
          "DELETE FROM ingestion_recordings WHERE id=ANY($1::uuid[]) AND created_at < $2::timestamptz",
          [recordingIds, CUTOFF],
        );
      if (mediaIds.length) {
        await client.query(
          "DELETE FROM evidence_upload_requests WHERE media_id=ANY($1::uuid[])",
          [mediaIds],
        );
        await client.query(
          "DELETE FROM evidence_links WHERE media_id=ANY($1::uuid[])",
          [mediaIds],
        );
        await client.query(
          "DELETE FROM evidence_media WHERE id=ANY($1::uuid[]) AND created_at < $2::timestamptz",
          [mediaIds, CUTOFF],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    const failed = [];
    for (const { key, sha256 } of affected.values()) {
      try {
        const file = join(realRoot, key);
        const hash = createHash("sha256")
          .update(await readFile(file))
          .digest("hex");
        if (hash !== sha256.toLowerCase())
          throw Error("hash changed after commit");
        await unlink(file);
      } catch (err) {
        failed.push({ key, error: String(err) });
      }
    }
    console.log(
      `DB COMMITTED. WAV lama yang dihapus: ${affected.size - failed.length}/${affected.size}`,
    );
    if (failed.length) {
      const report = join(process.cwd(), "audio_cleanup_remaining_files.json");
      await writeFile(
        report,
        JSON.stringify({ cutoffUtc: CUTOFF, failed }, null, 2),
      );
      console.error("Beberapa file tersisa, lihat", report);
      process.exitCode = 2;
    }
  }
} finally {
  await client.end();
}
