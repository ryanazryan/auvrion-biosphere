import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readPrivateWav, savePrivateWav } from "./private-storage";

const previousRoot = process.env.PRIVATE_EVIDENCE_DIR;

let storageRoot: string;

function makeValidWav(): Buffer {
  const sampleRate = 48000;
  const dataLength = sampleRate * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVE", 8, "ascii");

  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataLength, 40);

  return buffer;
}

beforeEach(async () => {
  storageRoot = await mkdtemp(join(tmpdir(), "auvrion-evidence-test-"));

  process.env.PRIVATE_EVIDENCE_DIR = storageRoot;
});

afterEach(async () => {
  if (previousRoot === undefined) {
    delete process.env.PRIVATE_EVIDENCE_DIR;
  } else {
    process.env.PRIVATE_EVIDENCE_DIR = previousRoot;
  }

  await rm(storageRoot, {
    recursive: true,
    force: true,
  });
});

describe("AB-WC-010 private filesystem storage", () => {
  it("saves validated WAV with random key and SHA-256", async () => {
    const input = makeValidWav();

    const result = await savePrivateWav(input, "audio/wav");

    expect(result.storageKey).toMatch(/^[0-9a-f-]{36}\.wav$/);

    expect(result.sha256).toBe(
      createHash("sha256").update(input).digest("hex"),
    );

    const stored = await readFile(join(storageRoot, result.storageKey));

    expect(stored).toEqual(input);
    expect(result.durationSeconds).toBe(1);
  });

  it("reads back media only when hash matches", async () => {
    const input = makeValidWav();

    const result = await savePrivateWav(input, "audio/wav");

    const loaded = await readPrivateWav(result.storageKey, result.sha256);

    expect(loaded).toEqual(input);
  });

  it("rejects unsupported media without creating a file", async () => {
    await expect(
      savePrivateWav(makeValidWav(), "application/pdf"),
    ).rejects.toThrow("UNSUPPORTED_AUDIO_MIME");

    expect(await readdir(storageRoot)).toEqual([]);
  });

  it("rejects unsafe storage keys", async () => {
    await expect(
      readPrivateWav("../secrets.wav", "a".repeat(64)),
    ).rejects.toThrow("INVALID_STORAGE_KEY");
  });

  it("detects modified media content", async () => {
    const result = await savePrivateWav(makeValidWav(), "audio/wav");

    await writeFile(
      join(storageRoot, result.storageKey),
      Buffer.from("tampered"),
    );

    await expect(
      readPrivateWav(result.storageKey, result.sha256),
    ).rejects.toThrow("MEDIA_INTEGRITY_MISMATCH");
  });

  it("rejects relative storage configuration", async () => {
    process.env.PRIVATE_EVIDENCE_DIR = "./public/audio";

    await expect(savePrivateWav(makeValidWav(), "audio/wav")).rejects.toThrow(
      "PRIVATE_EVIDENCE_DIR_MUST_BE_ABSOLUTE",
    );
  });
});
