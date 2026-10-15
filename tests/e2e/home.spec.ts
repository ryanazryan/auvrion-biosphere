import { expect, test } from "@playwright/test";

test("homepage is truthful, responsive, and keyboard accessible", async ({ page }, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Auvrion Biosphere — Environmental Intelligence");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: /Auvrion\s*Biosphere/ })).toBeVisible();
  await expect(page.getByText("Under development", { exact: true })).toBeVisible();
  await expect(page.getByText("Environmental Intelligence Web Platform", { exact: true })).toBeVisible();
  await expect(page.getByText("The application is not yet operational.", { exact: false })).toBeVisible();

  const fitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fitsViewport, "page should not overflow horizontally").toBe(true);

  await page.screenshot({ path: testInfo.outputPath("homepage.png"), fullPage: true });
  const aboutLink = page.getByRole("link", { name: "About the project" });
  await page.keyboard.press("Tab");
  await expect(aboutLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/#about$/);
  await expect(page.getByRole("heading", { name: "A foundation for understanding" })).toBeInViewport();
  expect(browserErrors, "page should not raise uncaught browser errors").toEqual([]);
});
