/**
 * Auvrion Ranger LISTEN private WAV diagnosis and safe exact-hash recovery.
 * Read-only by default. --restore=<absolute WAV path> only restores a MISSING
 * file with byte-for-byte SHA-256 equality to the existing DB receipt.
 * Requires: Node 24, existing pg dependency, .env.local, local dev DB.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, parse, relative, sep } from "node:path";
import pg from "pg";

const DEFAULT_TASK = "4ec2dc3c-cfed-4634-a817-fb8b40671c9c";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORAGE_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.wav$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const args = process.argv.slice(2);
const readArg = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const taskId = readArg("task") ?? DEFAULT_TASK;
const observationFilter = readArg("observation") ?? null;
const restore = readArg("restore") ?? null;

function fail(code, extra = "") {
  console.error(`RESULT: ${code}${extra ? ` | ${extra}` : ""}`);
  process.exitCode = 1;
}
function checkWav(bytes) {
  if (
    bytes.length < 44 ||
    bytes.length > MAX_AUDIO_BYTES ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return "INVALID_WAV_STRUCTURE";
  }
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) return "INVALID_RIFF_LENGTH";
  let fmt = null;
  let dataLength = null;
  let off = 12;
  while (off < bytes.length) {
    if (off + 8 > bytes.length) return "INVALID_WAV_CHUNK";
    const kind = bytes.toString("ascii", off, off + 4);
    const size = bytes.readUInt32LE(off + 4);
    const begin = off + 8;
    const end = begin + size;
    if (end > bytes.length) return "INVALID_WAV_CHUNK";
    if (kind === "fmt ") {
      if (fmt || size < 16) return "INVALID_WAV_FORMAT";
      fmt = {
        encoding: bytes.readUInt16LE(begin),
        channels: bytes.readUInt16LE(begin + 2),
        sampleRate: bytes.readUInt32LE(begin + 4),
        byteRate: bytes.readUInt32LE(begin + 8),
        blockAlign: bytes.readUInt16LE(begin + 12),
        bits: bytes.readUInt16LE(begin + 14),
      };
    }
    if (kind === "data") {
      if (dataLength !== null) return "DUPLICATE_AUDIO_DATA";
      dataLength = size;
    }
    off = end + (size % 2);
    if (off > bytes.length) return "INVALID_WAV_PADDING";
  }
  if (!fmt || !dataLength) return "MISSING_AUDIO_DATA";
  if (
    fmt.encoding !== 1 ||
    fmt.bits !== 16 ||
    ![1, 2].includes(fmt.channels) ||
    ![16000, 44100, 48000].includes(fmt.sampleRate)
  ) {
    return "UNSUPPORTED_WAV_ENCODING";
  }
  if (
    fmt.blockAlign !== fmt.channels * 2 ||
    fmt.byteRate !== fmt.sampleRate * fmt.blockAlign ||
    dataLength % fmt.blockAlign !== 0
  ) {
    return "INVALID_PCM_METADATA";
  }
  if (dataLength / fmt.byteRate > 30) return "AUDIO_DURATION_EXCEEDED";
  return "VALID_WAV";
}
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
async function safeStorageRoot() {
  const configured = process.env.PRIVATE_EVIDENCE_DIR;
  if (!configured) throw new Error("PRIVATE_EVIDENCE_DIR_REQUIRED");
  if (!isAbsolute(configured))
    throw new Error("PRIVATE_EVIDENCE_DIR_MUST_BE_ABSOLUTE");
  const info = await lstat(configured);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("INVALID_PRIVATE_STORAGE_DIRECTORY");
  const root = await realpath(configured);
  const projectRoot = await realpath(process.cwd());
  const pathFromProject = relative(projectRoot, root);
  const insideProject =
    pathFromProject === "" ||
    (pathFromProject !== ".." &&
      !pathFromProject.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromProject));
  if (insideProject || root === parse(root).root)
    throw new Error("UNSAFE_PRIVATE_STORAGE_DIRECTORY");
  return root;
}
async function fileStatus(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      return { kind: "UNSAFE_OR_NOT_FILE" };
    return { kind: "FILE", size: info.size };
  } catch (e) {
    if (e?.code === "ENOENT") return { kind: "MISSING" };
    throw e;
  }
}

async function main() {
  if (
    !UUID.test(taskId) ||
    (observationFilter && !UUID.test(observationFilter))
  )
    throw new Error("INVALID_TASK_OR_OBSERVATION_UUID");
  if (restore && (!isAbsolute(restore) || observationFilter === null)) {
    throw new Error("RESTORE_REQUIRES_ABSOLUTE_SOURCE_AND_--observation=UUID");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  const db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const query = await db.query(
      `
      SELECT r.id AS media_id, r.observation_id, r.recording_id,
             r.storage_key, r.audio_sha256, r.audio_bytes::text AS audio_bytes,
             r.duration_ms
        FROM domain_tasks t
        JOIN case_observation_links col
          ON col.case_id=t.case_id AND col.organization_id=t.organization_id
          AND col.unlinked_at IS NULL
        JOIN ingestion_recordings r
          ON r.observation_id=col.observation_id AND r.organization_id=t.organization_id
       WHERE t.id=$1
         AND ($2::uuid IS NULL OR r.observation_id=$2::uuid)
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [taskId, observationFilter],
    );
    console.log(`Task: ${taskId}`);
    console.log(`Receipts linked: ${query.rows.length}`);
    if (!query.rows.length) return fail("NO_LINKED_INGESTION_RECORDINGS");
    let root;
    try {
      root = await safeStorageRoot();
      console.log(
        "Private storage policy: OK (directory absolute, outside repo, not symlink)",
      );
    } catch (error) {
      return fail("PRIVATE_STORAGE_DIRECTORY_ERROR", error.message);
    }
    if (restore && query.rows.length !== 1)
      throw new Error("RESTORE_REQUIRES_EXACTLY_ONE_RECEIPT");
    for (const row of query.rows) {
      console.log(`\nObservation: ${row.observation_id}`);
      console.log(`Recording ID: ${row.recording_id}`);
      console.log(`Expected duration ms: ${row.duration_ms}`);
      const validMetadata =
        STORAGE_KEY.test(row.storage_key) &&
        HASH.test(row.audio_sha256) &&
        Number.isSafeInteger(Number(row.audio_bytes)) &&
        Number(row.audio_bytes) >= 44 &&
        Number(row.audio_bytes) <= MAX_AUDIO_BYTES;
      console.log(`Metadata valid: ${validMetadata}`);
      if (!validMetadata) {
        fail("INVALID_RECEIPT_METADATA");
        continue;
      }
      const target = join(root, row.storage_key);
      let status = await fileStatus(target);
      console.log(`Stored WAV: ${status.kind}`);
      if (status.kind === "MISSING" && restore) {
        const sourceStatus = await fileStatus(restore);
        if (sourceStatus.kind !== "FILE") {
          fail("RESTORE_SOURCE_INVALID_OR_MISSING");
          continue;
        }
        const candidate = await readFile(restore);
        const contentValid =
          candidate.length === Number(row.audio_bytes) &&
          sha256(candidate) === row.audio_sha256 &&
          checkWav(candidate) === "VALID_WAV";
        console.log(
          `Restore candidate exact receipt SHA-256/size/WAV match: ${contentValid}`,
        );
        if (!contentValid) {
          fail("RESTORE_CANDIDATE_DOES_NOT_MATCH");
          continue;
        }
        await copyFile(restore, target, constants.COPYFILE_EXCL);
        console.log(
          "RECOVERED: Missing private WAV restored from EXACT original matching receipt.",
        );
        status = await fileStatus(target);
      }
      if (status.kind !== "FILE") {
        fail("STORED_WAV_NOT_AVAILABLE");
        continue;
      }
      if (status.size > MAX_AUDIO_BYTES) {
        fail("STORED_WAV_TOO_LARGE");
        continue;
      }
      const bytes = await readFile(target);
      const sizeMatch = bytes.length === Number(row.audio_bytes);
      const hashMatch = sha256(bytes) === row.audio_sha256;
      const wav = checkWav(bytes);
      console.log(`File bytes: ${bytes.length} (expected ${row.audio_bytes})`);
      console.log(`Size matches DB: ${sizeMatch}`);
      console.log(`SHA-256 matches DB: ${hashMatch}`);
      console.log(`WAV validation: ${wav}`);
      if (!sizeMatch) fail("BYTE_LENGTH_MISMATCH");
      else if (!hashMatch) fail("MEDIA_INTEGRITY_MISMATCH");
      else if (wav !== "VALID_WAV") fail(wav);
      else
        console.log(
          "RESULT: AUDIO_OK — physical WAV matches existing immutable DB receipt.",
        );
    }
  } finally {
    await db.end();
  }
}
main().catch((e) => fail("DIAGNOSTIC_FAILED", e.message));
