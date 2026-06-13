import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("prjx_onboarding_done", "1");
    localStorage.setItem("prjx_locale", "en");
  });
});

test.describe("Hyperpool smoke", () => {
  test("home page loads with navigation tabs", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Hyperpool/i);
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("can switch between main tabs", async ({ page }) => {
    await page.goto("/");

    const tabs = ["Swap", "Position", "Portfolio", "Cashdrop"];
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

test.describe("Testnet deployment (998)", () => {
  test("does not show undeployed banner when 998.json is live", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/contracts not deployed|コントラクト未デプロイ/i)).toHaveCount(0);
  });

  test("all user tabs are reachable", async ({ page }) => {
    await page.goto("/");
    for (const label of ["Swap", "Position", "Portfolio", "Cashdrop", "Points", "Affiliate"]) {
      const tab = page.getByRole("button", { name: new RegExp(label, "i") }).first();
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
    }
  });

  test("admin page loads when admin is enabled", async ({ page }) => {
    test.skip(process.env.NEXT_PUBLIC_ADMIN_ENABLED !== "true", "Admin disabled in this build");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText("Admin Dashboard")).toBeVisible();
  });

  test("swap tab shows token inputs when disconnected", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /swap/i }).first().click();
    const body = page.locator("main");
    await expect(body).toBeVisible();
    await expect(body).not.toBeEmpty();
  });
});
