import { expect, test } from "@playwright/test";

test("health exposes only a minimal liveness response", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^application\/json\b/);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
  // Exact equality also rejects versions, paths, environment and DB diagnostics.
  expect(await response.json()).toEqual({ status: "ok" });
});
