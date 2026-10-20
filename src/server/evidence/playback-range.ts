/**
 * Parse a single HTTP byte range.
 *
 * Supported:
 * - bytes=0-99
 * - bytes=100-
 * - bytes=-100
 *
 * Multipart ranges are deliberately not supported.
 */

export type AudioByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "invalid" };

export function parseAudioByteRange(
  header: string | null,
  totalBytes: number,
): AudioByteRange {
  if (header === null) {
    return { kind: "full" };
  }

  if (
    !Number.isSafeInteger(totalBytes) ||
    totalBytes <= 0 ||
    header.length > 128
  ) {
    return { kind: "invalid" };
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);

  if (!match) {
    return { kind: "invalid" };
  }

  const first = match[1] ?? "";
  const last = match[2] ?? "";

  if (!first && !last) {
    return { kind: "invalid" };
  }

  const parseNumber = (value: string): number | null => {
    if (!/^\d{1,16}$/.test(value)) {
      return null;
    }

    const number = Number(value);

    return Number.isSafeInteger(number) ? number : null;
  };

  // Suffix range: bytes=-500
  if (!first) {
    const suffix = parseNumber(last);

    if (suffix === null || suffix <= 0) {
      return { kind: "invalid" };
    }

    return {
      kind: "partial",
      start: Math.max(0, totalBytes - suffix),
      end: totalBytes - 1,
    };
  }

  const start = parseNumber(first);

  if (start === null || start >= totalBytes) {
    return { kind: "invalid" };
  }

  const end = last ? parseNumber(last) : totalBytes - 1;

  if (end === null || end < start) {
    return { kind: "invalid" };
  }

  return {
    kind: "partial",
    start,
    end: Math.min(end, totalBytes - 1),
  };
}
