import { describe, expect, it } from "vitest";

import { type AudioByteRange, parseAudioByteRange } from "./playback-range";

type TestCase = {
  name: string;
  header: string | null;
  size: number;
  expected: AudioByteRange;
};

const cases: TestCase[] = [
  {
    name: "returns full response when Range is absent",
    header: null,
    size: 1000,
    expected: { kind: "full" },
  },
  {
    name: "parses an explicit byte range",
    header: "bytes=0-99",
    size: 1000,
    expected: {
      kind: "partial",
      start: 0,
      end: 99,
    },
  },
  {
    name: "parses an open-ended range",
    header: "bytes=100-",
    size: 1000,
    expected: {
      kind: "partial",
      start: 100,
      end: 999,
    },
  },
  {
    name: "parses a suffix range",
    header: "bytes=-100",
    size: 1000,
    expected: {
      kind: "partial",
      start: 900,
      end: 999,
    },
  },
  {
    name: "clamps a range ending beyond the file",
    header: "bytes=900-2000",
    size: 1000,
    expected: {
      kind: "partial",
      start: 900,
      end: 999,
    },
  },
  {
    name: "clamps a suffix exceeding the file length",
    header: "bytes=-2000",
    size: 1000,
    expected: {
      kind: "partial",
      start: 0,
      end: 999,
    },
  },
  {
    name: "allows the final byte",
    header: "bytes=999-999",
    size: 1000,
    expected: {
      kind: "partial",
      start: 999,
      end: 999,
    },
  },
  {
    name: "rejects range starting beyond the file",
    header: "bytes=1000-",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects reversed ranges",
    header: "bytes=500-100",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects zero-length suffix",
    header: "bytes=-0",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects empty bounds",
    header: "bytes=-",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects multipart ranges",
    header: "bytes=0-10,20-30",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects unsupported range units",
    header: "items=0-10",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects nonnumeric range bounds",
    header: "bytes=abc-def",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects unsafe numeric range values",
    header: "bytes=9999999999999999-",
    size: 1000,
    expected: { kind: "invalid" },
  },
  {
    name: "rejects range requests for empty media",
    header: "bytes=0-",
    size: 0,
    expected: { kind: "invalid" },
  },
];

describe("AB-WC-010 private playback byte ranges", () => {
  it.each(cases)("$name", ({ header, size, expected }) => {
    expect(parseAudioByteRange(header, size)).toEqual(expected);
  });
});
