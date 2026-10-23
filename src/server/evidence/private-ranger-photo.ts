import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { isAbsolute, join, parse, relative, sep } from "node:path";

export const MAX_RANGER_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_RANGER_PHOTOS_PER_FINDING = 5;
type PhotoMime = "image/jpeg" | "image/png" | "image/webp";
const KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_END = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

/** MIME comes from verified magic bytes, never a client filename or header. */
export function validateRangerPhoto(
  bytes: Uint8Array,
  claimed: string,
): PhotoMime {
  const data = Buffer.from(bytes);
  if (data.length === 0 || data.length > MAX_RANGER_PHOTO_BYTES) {
    throw new Error("INVALID_PHOTO_LENGTH");
  }
  let actual: PhotoMime | null = null;
  if (
    data.length >= 4 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255 &&
    data[data.length - 2] === 255 &&
    data[data.length - 1] === 217
  ) {
    actual = "image/jpeg";
  } else if (
    data.length >= 45 &&
    data.subarray(0, 8).equals(PNG_HEADER) &&
    data.toString("ascii", 12, 16) === "IHDR" &&
    data.readUInt32BE(16) > 0 &&
    data.readUInt32BE(20) > 0 &&
    data.readUInt32BE(16) <= 10000 &&
    data.readUInt32BE(20) <= 10000 &&
    data.subarray(-12).equals(PNG_END)
  ) {
    actual = "image/png";
  } else if (
    data.length >= 16 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP" &&
    data.readUInt32LE(4) + 8 === data.length
  ) {
    actual = "image/webp";
  }
  if (!actual || actual !== claimed) throw new Error("INVALID_PHOTO_FORMAT");
  return actual;
}

async function folder() {
  const configured = process.env.PRIVATE_EVIDENCE_DIR;
  if (!configured || !isAbsolute(configured))
    throw new Error("PRIVATE_EVIDENCE_DIR_REQUIRED");
  const stat = await lstat(configured);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("INVALID_PRIVATE_STORAGE_DIRECTORY");
  const root = await realpath(configured);
  const project = await realpath(process.cwd());
  const pathFromProject = relative(project, root);
  if (
    root === parse(root).root ||
    pathFromProject === "" ||
    (pathFromProject !== ".." &&
      !pathFromProject.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromProject))
  ) {
    throw new Error("UNSAFE_PRIVATE_STORAGE_DIRECTORY");
  }
  const dir = join(root, "ranger-photos");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const dirInfo = await lstat(dir);
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink())
    throw new Error("INVALID_PHOTO_DIRECTORY");
  return dir;
}

function checksum(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function storeRangerPhoto(bytes: Uint8Array, claimedMime: string) {
  const mimeType = validateRangerPhoto(bytes, claimedMime);
  const directory = await folder();
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
    mimeType
  ];
  const storageKey = `${randomUUID()}.${ext}`;
  const staging = `.${storageKey}.${randomUUID()}.part`;
  const temp = join(directory, staging);
  let tempCreated = false;
  try {
    const handle = await open(temp, "wx", 0o600);
    tempCreated = true;
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, join(directory, storageKey));
    tempCreated = false;
  } catch (error) {
    if (tempCreated) await unlink(temp).catch(() => {});
    throw error;
  }
  return {
    storageKey,
    mimeType,
    sha256: checksum(bytes),
    byteLength: bytes.byteLength,
  };
}

/** Only metadata-scoped services may call this function. Never expose storage keys in API JSON. */
export async function readRangerPhoto(
  storageKey: string,
  digest: string,
  mime: string,
) {
  if (!KEY.test(storageKey) || !/^[0-9a-f]{64}$/.test(digest))
    throw new Error("INVALID_PHOTO_REFERENCE");
  const directory = await folder();
  const path = join(directory, storageKey);
  const stat = await lstat(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_RANGER_PHOTO_BYTES
  ) {
    throw new Error("INVALID_PRIVATE_PHOTO");
  }
  const bytes = await readFile(path);
  validateRangerPhoto(bytes, mime);
  if (checksum(bytes) !== digest) throw new Error("PHOTO_INTEGRITY_MISMATCH");
  return bytes;
}

export async function removeOrphanRangerPhoto(
  storageKey: string,
  digest: string,
  mime: string,
) {
  await readRangerPhoto(storageKey, digest, mime);
  const directory = await folder();
  await unlink(join(directory, storageKey));
}
