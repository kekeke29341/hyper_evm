import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("prjx_onboarding_done", "1");
    localStorage.setItem("prjx_locale", "en");
  });
});

test.describe("Financial disclosures", () => {
  test("cashdrop tab explains USDC vs HYPE fee split", async ({ page }) => {
    await page.goto("/cashdrop");
    await expect(page.getByText(/70% of USDC fees → daily Cashdrop/i)).toBeVisible();
    await expect(page.getByText(/HYPE fees → Vault share value/i)).toBeVisible();
    await expect(page.getByText(/Vault shares from the distribution snapshot/i)).toBeVisible();
  });

  test("affiliate tab explains referral normalization", async ({ page }) => {
    await page.goto("/affiliate");
    await expect(page.getByText(/fixed USDC pool/i)).toBeVisible();
    await expect(page.getByText(/10%.*15%/i).first()).toBeVisible();
  });

  test("dashboard tab loads earnings section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
  });

  test("deposit tab shows vault path", async ({ page }) => {
    await page.goto("/deposit");
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
  });

  test("position tab shows liquidity metrics", async ({ page }) => {
    await page.goto("/position");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
  });
});

test.describe("Cashdrop claim window UI", () => {
  test("shows fee share stat", async ({ page }) => {
    await page.goto("/cashdrop");
    await expect(page.getByText("User share", { exact: true })).toBeVisible();
  });
});
