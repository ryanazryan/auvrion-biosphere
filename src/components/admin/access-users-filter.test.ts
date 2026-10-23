import { describe, expect, it } from "vitest";
import { filterAccessUsers } from "./access-users-filter";

const users = [
  { name: "Ranger Satu", email: "ranger@test.local", accessStatus: "active" },
  {
    name: "Operator Dua",
    email: "operator@test.local",
    accessStatus: "disabled",
  },
  {
    name: "Supervisor Tiga",
    email: "supervisor@test.local",
    accessStatus: "pending_activation",
  },
];

describe("admin access user filters", () => {
  it("returns all users with default filters", () => {
    expect(filterAccessUsers(users, "", "all")).toEqual(users);
  });

  it("matches name without case sensitivity", () => {
    expect(filterAccessUsers(users, " RANGER ", "all")).toEqual([users[0]]);
  });

  it("matches email", () => {
    expect(filterAccessUsers(users, "operator@", "all")).toEqual([users[1]]);
  });

  it("filters by account status", () => {
    expect(filterAccessUsers(users, "", "disabled")).toEqual([users[1]]);
  });

  it("combines search and status filters", () => {
    expect(filterAccessUsers(users, "supervisor", "active")).toEqual([]);
  });

  it("preserves original input records", () => {
    const result = filterAccessUsers(users, "", "all");
    expect(result[0]).toBe(users[0]);
  });
});
