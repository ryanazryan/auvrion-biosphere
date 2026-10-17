import { describe, expect, it } from "vitest";
import { buildDecisionNotification } from "./content";
import { notificationRetryDelaySeconds } from "./retry";

const statusUrl = "http://localhost:3000/request-access/status";

describe("decision notification content", () => {
  it("makes approval clearly distinct from account activation", () => {
    const result = buildDecisionNotification({
      kind: "approved",
      applicantName: "Gibran",
      statusUrl,
    });
    expect(result.subject).toContain("Disetujui");
    expect(result.text).toContain("belum aktif");
    expect(result.text).toContain(statusUrl);
    expect(result.text).not.toContain("password");
  });

  it("does not expose internal decision reasons in rejection email", () => {
    const result = buildDecisionNotification({
      kind: "rejected",
      applicantName: "Status Test",
      statusUrl,
    });
    expect(result.subject).toContain("Pemberitahuan");
    expect(result.text).toContain("belum dapat disetujui");
    expect(result.text).toContain(statusUrl);
  });
});

describe("notification retry delay", () => {
  it("uses exponential backoff and caps at one hour", () => {
    expect(notificationRetryDelaySeconds(1)).toBe(30);
    expect(notificationRetryDelaySeconds(2)).toBe(60);
    expect(notificationRetryDelaySeconds(3)).toBe(120);
    expect(notificationRetryDelaySeconds(20)).toBe(3600);
  });
});
