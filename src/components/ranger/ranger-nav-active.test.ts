import { describe, expect, it } from "vitest";
import { activeRangerNavPath } from "./ranger-nav-active";

const links = [
  "/ranger",
  "/ranger/map",
  "/ranger/tasks",
  "/ranger/findings",
  "/ranger/history",
];

function actives(path: string) {
  return links.filter((href) => activeRangerNavPath(path, href));
}

describe("Ranger sidebar active route", () => {
  it.each([
    ["/ranger", "/ranger"],
    ["/ranger/map", "/ranger/map"],
    ["/ranger/tasks", "/ranger/tasks"],
    ["/ranger/tasks/123", "/ranger/tasks"],
    ["/ranger/findings", "/ranger/findings"],
    ["/ranger/tasks/123/findings/abc", "/ranger/findings"],
    ["/ranger/history", "/ranger/history"],
    ["/ranger/tasks/123/history", "/ranger/history"],
  ])("only highlights expected link on %s", (path, expected) => {
    expect(actives(path)).toEqual([expected]);
  });
  it("does not mark every menu active on history pages", () => {
    expect(actives("/ranger/history")).toEqual(["/ranger/history"]);
  });
});
