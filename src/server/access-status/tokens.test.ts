import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createStatusLinkToken,
  createStatusSessionValue,
  hashStatusToken,
  validStatusLinkToken,
  verifyStatusSessionValue,
} from "./tokens";

const APPLICATION_ID = "a8aa0c55-b2bc-428b-92af-59f64266ea2f";
const oldSecret = process.env.BETTER_AUTH_SECRET;

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET =
    "local-test-secret-at-least-32-chars-not-real";
});
afterEach(() => {
  if (oldSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
  else process.env.BETTER_AUTH_SECRET = oldSecret;
});

describe("applicant status credentials", () => {
  it("creates a 43-character recovery token stored only by hash", () => {
    const first = createStatusLinkToken();
    const second = createStatusLinkToken();
    expect(validStatusLinkToken(first.token)).toBe(true);
    expect(first.token).not.toEqual(second.token);
    expect(first.tokenHash).toBe(hashStatusToken(first.token));
    expect(first.tokenHash).not.toBe(first.token);
  });

  it("rejects malformed recovery tokens", () => {
    expect(validStatusLinkToken("123")).toBe(false);
    expect(validStatusLinkToken(null)).toBe(false);
  });

  it("issues a signed session restricted to the correct application", () => {
    const cookie = createStatusSessionValue(APPLICATION_ID);
    expect(verifyStatusSessionValue(cookie)).toBe(APPLICATION_ID);
    expect(
      verifyStatusSessionValue(
        cookie.replace(APPLICATION_ID, "00000000-0000-0000-0000-000000000000"),
      ),
    ).toBeNull();
    expect(verifyStatusSessionValue(undefined)).toBeNull();
  });

  it("rejects invalid signatures", () => {
    const cookie = createStatusSessionValue(APPLICATION_ID);
    const altered = cookie.slice(0, -1) + (cookie.endsWith("a") ? "b" : "a");
    expect(verifyStatusSessionValue(altered)).toBeNull();
  });
});
