import { describe, expect, it } from "vitest";

import { validateAccessRequest } from "./access-request";

describe("validateAccessRequest", () => {
  it("normalizes name whitespace and email case", () => {
    expect(
      validateAccessRequest({
        name: "  Test   Applicant  ",
        email: "  NEW-OPERATOR@EXAMPLE.TEST ",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Test Applicant",
        email: "new-operator@example.test",
      },
    });
  });

  it("rejects missing and malformed fields", () => {
    expect(validateAccessRequest(null).ok).toBe(false);
    expect(validateAccessRequest({ name: "X", email: "bad" }).ok).toBe(false);
    expect(validateAccessRequest({ name: 14, email: [] }).ok).toBe(false);
  });

  it("enforces maximum lengths", () => {
    const result = validateAccessRequest({
      name: "a".repeat(101),
      email: `${"a".repeat(245)}@example.test`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors.email).toBeDefined();
    }
  });

  it("rejects array payloads", () => {
    expect(validateAccessRequest([{ name: "John", email: "x@y.id" }])).toEqual({
      ok: false,
      errors: {
        name: "Nama lengkap wajib diisi.",
        email: "Email wajib diisi.",
      },
    });
  });
});
