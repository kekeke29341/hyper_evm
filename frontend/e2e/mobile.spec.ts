import { test, expect } from "@playwright/test";

const MOBILE_ROUTES = ["/", "/deposit", "/position", "/cashdrop", "/affiliate"] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("prjx_onboarding_done", "1");
    localStorage.setItem("prjx_locale", "ja");
  });
});

test.describe("Mobile layout (iPhone 13)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  for (const path of MOBILE_ROUTES) {
    test(`no horizontal overflow on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 1;
      });
      expect(overflow).toBe(false);
    });
  }

  test("position page action buttons are stacked and tappable", async ({ page }) => {
    await page.goto("/position");

    const buttons = page.getByRole("button", {
      name: /流動性を追加|手数料を回収|ペアを閉じる/,
    });
    const count = await buttons.count();
    if (count < 3) {
      test.skip(true, "Demo position panel not visible");
      return;
    }

    for (let i = 0; i < 3; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
      expect(box?.width ?? 0).toBeGreaterThan(200);
    }

    const first = await buttons.nth(0).boundingBox();
    const second = await buttons.nth(1).boundingBox();
    if (first && second) {
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 2);
    }
  });

  test("mobile nav links update URL", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /ポジション|Position/i }).first().click();
    await expect(page).toHaveURL(/\/position$/);
  });

  test("wallet modal opens on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /ウォレット|connect/i }).click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
  });
});
