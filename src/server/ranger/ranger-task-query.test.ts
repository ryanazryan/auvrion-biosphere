import { describe, expect, it } from "vitest";
import {
  isTaskUuid,
  parseRangerTaskDetailQuery,
  parseRangerTasksQuery,
} from "./ranger-task-query";

const org = "00000000-0000-4000-8000-000000000001";

describe("WC-013 Ranger task read query", () => {
  it("parses scoped list with safe default and bounded limit", () => {
    expect(
      parseRangerTasksQuery(new URLSearchParams({ organizationId: org })),
    ).toEqual({
      ok: true,
      organizationId: org,
      limit: 25,
    });
    expect(
      parseRangerTasksQuery(
        new URLSearchParams({ organizationId: org, limit: "50" }),
      ),
    ).toEqual({
      ok: true,
      organizationId: org,
      limit: 50,
    });
  });

  it("denies invalid or duplicated organization", () => {
    for (const query of [
      "",
      "organizationId=x",
      `organizationId=${org}&organizationId=${org}`,
    ]) {
      expect(parseRangerTasksQuery(new URLSearchParams(query)).ok).toBe(false);
    }
  });

  it("denies invalid pagination and unsolicited query fields", () => {
    for (const suffix of [
      "limit=0",
      "limit=51",
      "limit=-1",
      "limit=01",
      "limit=1.5",
      "limit=2&limit=2",
      "rangerUserId=other",
    ]) {
      expect(
        parseRangerTasksQuery(
          new URLSearchParams(`organizationId=${org}&${suffix}`),
        ).ok,
      ).toBe(false);
    }
  });

  it("detail accepts only one organization selector and UUID task IDs", () => {
    expect(
      parseRangerTaskDetailQuery(new URLSearchParams({ organizationId: org })),
    ).toEqual({
      ok: true,
      organizationId: org,
    });
    expect(
      parseRangerTaskDetailQuery(
        new URLSearchParams(`organizationId=${org}&limit=1`),
      ).ok,
    ).toBe(false);
    expect(isTaskUuid(org)).toBe(true);
    expect(isTaskUuid("bad-task-id")).toBe(false);
  });
});
