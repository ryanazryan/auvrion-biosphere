import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateRangerPhoto } from "./private-ranger-photo";

describe("Ranger photo validation", () => {
  it("rejects empty images", () => {
    expect(() => validateRangerPhoto(new Uint8Array(), "image/png")).toThrow(
      "INVALID_PHOTO_LENGTH",
    );
  });
  it("rejects SVG or spoofed mime", () => {
    const bytes = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" />',
    );
    expect(() => validateRangerPhoto(bytes, "image/png")).toThrow(
      "INVALID_PHOTO_FORMAT",
    );
  });
  it("rejects arbitrary JPEG mimics", () => {
    expect(() =>
      validateRangerPhoto(new Uint8Array([255, 216, 1, 2]), "image/jpeg"),
    ).toThrow("INVALID_PHOTO_FORMAT");
  });
  it("rejects oversized payloads", () => {
    expect(() =>
      validateRangerPhoto(new Uint8Array(5 * 1024 * 1024 + 1), "image/png"),
    ).toThrow("INVALID_PHOTO_LENGTH");
  });
});
