import { describe, expect, it } from "vitest";
import {
  INITIAL_STATE,
  NAVIGATION,
  readGuestState,
  TOURS,
} from "./role-demo-v3-data";

describe("public guest role showcase", () => {
  it("exposes the production role navigation categories", () => {
    const operator = NAVIGATION.operator.flatMap((group) =>
      group.items.map((item) => item.tab),
    );
    const supervisor = NAVIGATION.supervisor.flatMap((group) =>
      group.items.map((item) => item.tab),
    );
    const ranger = NAVIGATION.ranger.flatMap((group) =>
      group.items.map((item) => item.tab),
    );
    expect(operator).toEqual(
      expect.arrayContaining([
        "overview",
        "observations",
        "observation-new",
        "review",
        "handoffs",
        "iot",
        "listen",
        "prevent",
        "map",
        "reports",
      ]),
    );
    expect(supervisor).toEqual(
      expect.arrayContaining([
        "overview",
        "map",
        "analytics",
        "decisions",
        "outcomes",
        "assignments",
        "tasks",
      ]),
    );
    expect(ranger).toEqual(
      expect.arrayContaining([
        "overview",
        "map",
        "tasks",
        "findings",
        "history",
      ]),
    );
  });

  it("all interactive tour steps point at visible navigation tabs", () => {
    for (const role of ["operator", "supervisor", "ranger"] as const) {
      const tabs = new Set(
        NAVIGATION[role].flatMap((group) =>
          group.items.map((item) => item.tab),
        ),
      );
      expect(TOURS[role].length).toBeGreaterThan(3);
      for (const step of TOURS[role]) {
        expect(tabs.has(step.tab)).toBe(true);
        expect(step.anchor.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses only the synthetic default if browser state is malformed", () => {
    expect(readGuestState(null)).toEqual(INITIAL_STATE);
    expect(readGuestState({ observations: "invalid", events: [] })).toEqual(
      INITIAL_STATE,
    );
  });

  it("caps browser session records and activity history", () => {
    const input = {
      ...INITIAL_STATE,
      observations: Array.from({ length: 100 }, (_, index) => ({
        ...INITIAL_STATE.observations[0],
        id: `OBS-${index}`,
      })),
      events: Array.from({ length: 100 }, (_, index) => `Event ${index}`),
    };
    const restored = readGuestState(input);
    expect(restored.observations).toHaveLength(40);
    expect(restored.events).toHaveLength(60);
  });
});
