/** UI-only view over a bounded authorized discovery response. Not a full-history counter. */
export const RECORDING_PAGE_SIZE = 6;

export type RecordingKind = "device_recording" | "human_uploaded_audio";
export type RecordingFilter = "all" | "device" | "manual";
export type RecordingSource = {
  kind: RecordingKind;
  id: string;
  byteLength: number;
  sha256: string;
  recordedAt?: string;
  ingestionMode?: "live" | "historical" | "simulation";
};

export function recordingPage<T extends RecordingSource>(
  sources: readonly T[],
  filter: RecordingFilter,
  requestedPage: number,
) {
  const filtered = sources
    .filter((source) =>
      filter === "all"
        ? true
        : filter === "device"
          ? source.kind === "device_recording"
          : source.kind === "human_uploaded_audio",
    )
    .sort((a, b) => {
      // On a mixed list, favor real device receipts over laptop uploads.
      if (filter === "all" && a.kind !== b.kind) {
        return a.kind === "device_recording" ? -1 : 1;
      }
      return (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "");
    });
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / RECORDING_PAGE_SIZE));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(pages, requestedPage))
    : 1;
  const start = (page - 1) * RECORDING_PAGE_SIZE;
  return {
    page,
    pages,
    total,
    start,
    items: filtered.slice(start, start + RECORDING_PAGE_SIZE),
  };
}
