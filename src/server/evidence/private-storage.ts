import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, parse, relative, sep } from "node:path";

import { MAX_AUDIO_BYTES, validateWavPcm16 } from "./wav-validation";

const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.wav$/;

async function getPrivateStorageRoot(): Promise<string> {
  const configured = process.env.PRIVATE_EVIDENCE_DIR;

  if (!configured) {
    throw new Error("PRIVATE_EVIDENCE_DIR_REQUIRED");
  }

  if (!isAbsolute(configured)) {
    throw new Error("PRIVATE_EVIDENCE_DIR_MUST_BE_ABSOLUTE");
  }

  const info = await lstat(configured);

  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("INVALID_PRIVATE_STORAGE_DIRECTORY");
  }

  const root = await realpath(configured);
  const projectRoot = await realpath(process.cwd());
  const relativePath = relative(projectRoot, root);

  const insideProject =
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath));

  if (insideProject || root === parse(root).root) {
    throw new Error("UNSAFE_PRIVATE_STORAGE_DIRECTORY");
  }

  return root;
}

function getFilename(storageKey: string): string {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new Error("INVALID_STORAGE_KEY");
  }

  return storageKey;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function savePrivateWav(
  inputBytes: Uint8Array,
  declaredMimeType: string,
) {
  // Copy before validation to avoid later mutation by the caller.
  const bytes = Buffer.from(inputBytes);

  const validation = validateWavPcm16(bytes, declaredMimeType);

  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const root = await getPrivateStorageRoot();

  // Never derive a filesystem path from the client's filename.
  const storageKey = `${randomUUID()}.wav`;
  const destination = join(root, storageKey);
  const digest = sha256(bytes);

  let created = false;

  try {
    // wx refuses to overwrite an existing path.
    // 0600 requests owner-only permissions on POSIX.
    const handle = await open(destination, "wx", 0o600);
    created = true;

    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (created) {
      await unlink(destination).catch(() => {});
    }

    throw error;
  }

  return {
    storageKey,
    sha256: digest,
    ...validation.metadata,
  };
}

export async function readPrivateWav(
  storageKey: string,
  expectedSha256: string,
): Promise<Buffer> {
  const filename = getFilename(storageKey);

  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error("INVALID_EXPECTED_SHA256");
  }

  const root = await getPrivateStorageRoot();
  const destination = join(root, filename);

  const info = await lstat(destination);

  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_AUDIO_BYTES) {
    throw new Error("INVALID_PRIVATE_MEDIA_FILE");
  }

  const bytes = await readFile(destination);

  if (bytes.byteLength > MAX_AUDIO_BYTES || sha256(bytes) !== expectedSha256) {
    throw new Error("MEDIA_INTEGRITY_MISMATCH");
  }

  return bytes;
}

/**
 * Internal cleanup only.
 * Never expose this function as a public HTTP operation.
 */
export async function deletePrivateWav(
  storageKey: string,
  expectedSha256: string,
): Promise<void> {
  // Verify the file before deleting it.
  await readPrivateWav(storageKey, expectedSha256);

  const root = await getPrivateStorageRoot();
  const filename = getFilename(storageKey);

  await unlink(join(root, filename));
}
