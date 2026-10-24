import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const roles = [
  {
    role: "operator",
    path: "/operator/overview",
    navigationLabel: "Navigasi operator",
    openLabel: "Buka navigasi",
    closeLabel: "Tutup navigasi",
  },
  {
    role: "supervisor",
    path: "/supervisor/overview",
    navigationLabel: "Navigasi supervisor",
    openLabel: "Buka navigasi Supervisor",
    closeLabel: "Tutup navigasi Supervisor",
  },
  {
    role: "ranger",
    path: "/ranger",
    navigationLabel: "Navigasi Ranger seluler",
    openLabel: "Menu akun",
    closeLabel: "Menu akun",
  },
] as const;

// A real authorized account state is needed. Never commit auth states or test secrets.
for (const subject of roles) {
  test.describe(`${subject.role} workspace`, () => {
    const auth = resolve(`e2e/.auth/${subject.role}.json`);
    test.skip(
      !existsSync(auth),
      `Missing ${subject.role} auth state; capture a real test account session`,
    );
    test.use({ storageState: auth });

    test("renders authorized landing without horizontal page overflow", async ({
      page,
    }, testInfo) => {
      await page.goto(subject.path);
      await expect(page).toHaveURL(
        new RegExp(`${subject.path.replace(/\//g, "\\/")}(?:/)?(?:\\?.*)?$`),
      );
      await expect(page.locator("main").first()).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(
        overflow.documentWidth,
        `Horizontal overflow on ${testInfo.project.name}`,
      ).toBeLessThanOrEqual(overflow.viewportWidth + 2);
      await testInfo.attach(`${subject.role}-${testInfo.project.name}`, {
        body: await page.screenshot({ animations: "disabled" }),
        contentType: "image/png",
      });
    });

    if (subject.role !== "ranger") {
      test("mobile drawer traps focus and Escape restores focus to opener", async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name === "desktop-1366",
          "Desktop uses persistent sidebar",
        );
        await page.goto(subject.path);
        const trigger = page.getByRole("button", {
          name: subject.openLabel,
          exact: true,
        });
        await expect(trigger).toBeVisible();
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", {
          name: subject.navigationLabel,
        });
        await expect(dialog).toBeVisible();
        await expect(trigger).toHaveAttribute("aria-expanded", "true");
        const close = dialog
          .getByRole("button", { name: subject.closeLabel, exact: true })
          .last();
        await expect(close).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        expect(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
        ).toBe(true);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
    } else {
      test("Ranger mobile account menu closes with Escape", async ({
        page,
      }, testInfo) => {
        test.skip(
          testInfo.project.name === "desktop-1366",
          "Account menu is mobile-only",
        );
        await page.goto(subject.path);
        const trigger = page.getByRole("button", { name: "Menu akun" });
        await expect(trigger).toBeVisible();
        await trigger.click();
        await expect(page.locator("#ranger-account-menu")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#ranger-account-menu")).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
    }
  });
}

test("login remains reachable without test-account session", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator("body")).toBeVisible();
  await expect(
    page.locator("input:visible,button:visible").first(),
  ).toBeVisible();
});
