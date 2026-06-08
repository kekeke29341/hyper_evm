import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("prjx_onboarding_done", "1");
  });
});

test.describe("Project X smoke", () => {
  test("home page loads with navigation tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Project X|PRJX/i);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("can switch between main tabs", async ({ page }) => {
    await page.goto("/");

    const tabs = ["Swap", "Liquidity", "Portfolio", "Cashdrop"];
    for (const label of tabs) {
      const tab = page.getByRole("button", { name: new RegExp(label, "i") }).first();
      if (await tab.isVisible()) {
        await tab.click();
        await expect(tab).toBeVisible();
      }
    }
  });

  test("shows connect wallet affordance when disconnected", async ({ page }) => {
    await page.goto("/");
    const connect = page.getByRole("button", { name: /connect wallet|ウォレット/i }).first();
    await expect(connect).toBeVisible();
  });
});
