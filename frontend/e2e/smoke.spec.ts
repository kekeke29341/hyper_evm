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
    await expect(page.getByRole("region", { name: /wallet alert notice/i })).toBeVisible();
  });

  test("can switch between main tabs and update URL", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");

    const routes: { label: string; url: RegExp }[] = [
      { label: "Bridge", url: /\/deposit$/ },
      { label: "Position", url: /\/position$/ },
      { label: "Cashdrop", url: /\/cashdrop$/ },
    ];

    for (const { label, url } of routes) {
      const tab = page.getByRole("link", { name: new RegExp(label, "i") }).first();
      if (await tab.isVisible()) {
        await tab.click();
        await expect(page).toHaveURL(url);
      }
    }
  });

  test("shows connect wallet affordance when disconnected", async ({ page }) => {
    await page.goto("/deposit");
    const connect = page.locator("main").getByRole("button", { name: /connect wallet|ウォレット/i }).last();
    await expect(connect).toBeVisible();
    await expect(connect).toBeEnabled();
  });
});

test.describe("Testnet deployment (998)", () => {
  test("does not show undeployed banner when 998.json is live", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/contracts not deployed|コントラクト未デプロイ/i)).toHaveCount(0);
  });

  test("all user tabs are reachable via URL", async ({ page }) => {
    const routes: { label: string; path: string }[] = [
      { label: "Dashboard", path: "/" },
      { label: "Bridge", path: "/deposit" },
      { label: "Position", path: "/position" },
      { label: "Cashdrop", path: "/cashdrop" },
      { label: "Affiliate", path: "/affiliate" },
    ];

    for (const { label, path } of routes) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path + "$"}`));
      const tab = page.getByRole("link", { name: new RegExp(label, "i") }).first();
      await expect(tab).toBeVisible();
      await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
    }
  });

  test("admin page loads when admin is enabled", async ({ page }) => {
    test.skip(process.env.NEXT_PUBLIC_ADMIN_ENABLED !== "true", "Admin disabled in this build");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText("Admin Dashboard")).toBeVisible();
  });

  test("deposit tab shows bridge UI when disconnected", async ({ page }) => {
    await page.goto("/deposit");
    const body = page.locator("main");
    await expect(body).toBeVisible();
    await expect(body).not.toBeEmpty();
  });
});
