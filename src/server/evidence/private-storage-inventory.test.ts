import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { inspectPrivateAudioInventory } from "./private-storage";

let storageRoot: string;
let previousStorageRoot: string | undefined;

beforeEach(async () => {
  previousStorageRoot = process.env.PRIVATE_EVIDENCE_DIR;

  storageRoot = await mkdtemp(join(tmpdir(), "auvrion-wc010-inventory-"));

  process.env.PRIVATE_EVIDENCE_DIR = storageRoot;
});

afterEach(async () => {
  if (previousStorageRoot === undefined) {
    delete process.env.PRIVATE_EVIDENCE_DIR;
  } else {
    process.env.PRIVATE_EVIDENCE_DIR = previousStorageRoot;
  }

  await rm(storageRoot, {
    recursive: true,
    force: true,
  });
});

describe("AB-WC-010 private storage inventory", () => {
  it("reports an empty private storage directory", async () => {
    const entries = await inspectPrivateAudioInventory();

    expect(entries).toEqual([]);
  });

  it("discovers published and staging files without deleting them", async () => {
    const publishedName = `${randomUUID()}.wav`;

    const stagingName = `.${randomUUID()}.wav.${randomUUID()}.part`;

    const publishedPath = join(storageRoot, publishedName);
    const stagingPath = join(storageRoot, stagingName);

    await writeFile(publishedPath, Buffer.from("published"));
    await writeFile(stagingPath, Buffer.from("staging"));

    const oldTime = new Date(Date.now() - 20 * 60_000);

    await utimes(publishedPath, oldTime, oldTime);
    await utimes(stagingPath, oldTime, oldTime);

    const entries = await inspectPrivateAudioInventory();

    expect(entries).toHaveLength(2);

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: publishedName,
          kind: "published",
        }),
        expect.objectContaining({
          name: stagingName,
          kind: "staging",
        }),
      ]),
    );

    for (const entry of entries) {
      expect(Math.abs(entry.modifiedAtMs - oldTime.getTime())).toBeLessThan(
        3000,
      );
    }

    // Inventory must be read-only.
    expect((await stat(publishedPath)).isFile()).toBe(true);
    expect((await stat(stagingPath)).isFile()).toBe(true);
  });

  it("ignores unrelated files and directories", async () => {
    await writeFile(
      join(storageRoot, ".unrelated.part"),
      "not an audio staging file",
    );

    await writeFile(join(storageRoot, "invalid.wav"), "invalid filename");

    await writeFile(join(storageRoot, "notes.txt"), "unrelated");

    await mkdir(join(storageRoot, `${randomUUID()}.wav`));

    const entries = await inspectPrivateAudioInventory();

    expect(entries).toEqual([]);
  });
});
