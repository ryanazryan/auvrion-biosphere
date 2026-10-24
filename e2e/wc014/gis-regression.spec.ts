import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const operatorState = resolve("e2e/.auth/operator.json");
test.describe("Operator GIS textual alternative and recovery", () => {
  test.skip(
    !existsSync(operatorState),
    "Missing authorized Operator browser state",
  );
  test.use({ storageState: operatorState });

  test("textual table alternative remains usable without map rendering", async ({
    page,
  }, testInfo) => {
    await page.goto("/operator/map");
    await page.getByRole("button", { name: "Tampilan tabel" }).click();
    await expect(
      page.getByRole("heading", { name: "Daftar observasi" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await testInfo.attach(`gis-table-${testInfo.project.name}`, {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  });

  test("failed observation request presents an error and retry action", async ({
    page,
  }) => {
    await page.route(/\/api\/gis\/observations(?:\?|$)/, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "SERVICE_UNAVAILABLE" }),
      });
    });
    await page.goto("/operator/map");
    const error = page
      .getByRole("alert")
      .filter({ hasText: "Gagal memuat observasi" });
    await expect(error).toBeVisible();
    const retry = error.getByRole("button", { name: "Coba lagi" });
    await expect(retry).toBeEnabled();
  });
});
