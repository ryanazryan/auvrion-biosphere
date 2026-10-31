import { describe, expect, it } from "vitest";
import { isPermittedBetaEmail } from "./beta-allowlist";

describe("closed production beta allowlist", () => {
  const env = {
    NODE_ENV: "production",
    AUVRION_BETA_ALLOWED_EMAILS: "first@example.com, SECOND@example.com",
  };
  it("denies all applicants when the allowlist is missing", () => {
    expect(
      isPermittedBetaEmail("first@example.com", { NODE_ENV: "production" }),
    ).toBe(false);
  });
  it("accepts exact case-insensitive allowed emails", () => {
    expect(isPermittedBetaEmail("SECOND@example.com", env)).toBe(true);
  });
  it("does not accept partial matches or arbitrary emails", () => {
    expect(isPermittedBetaEmail("third@example.com", env)).toBe(false);
    expect(isPermittedBetaEmail("xfirst@example.com", env)).toBe(false);
  });
  it("retains local-development enrollment behavior", () => {
    expect(
      isPermittedBetaEmail("test@example.com", { NODE_ENV: "development" }),
    ).toBe(true);
  });
});
