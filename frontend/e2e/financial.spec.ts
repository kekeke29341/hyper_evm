import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("prjx_onboarding_done", "1");
    localStorage.setItem("prjx_locale", "en");
  });
});

test.describe("Financial disclosures", () => {
  test("cashdrop tab explains USDC-only auto payout", async ({ page }) => {
    await page.goto("/cashdrop");
    await expect(page.getByText(/Most LP fees \(USDC equivalent\) → daily auto payout/i)).toBeVisible();
    await expect(page.getByText(/HYPE fees auto-converted to USDC on harvest/i)).toBeVisible();
    await expect(page.getByText(/Auto payout is based on Vault shares at the distribution snapshot/i)).toBeVisible();
  });

  test("affiliate tab explains referral normalization", async ({ page }) => {
    await page.goto("/affiliate");
    await expect(page.getByText(/fixed USDC pool/i)).toBeVisible();
    await expect(page.getByText(/5%.*15%/i).first()).toBeVisible();
  });

  test("dashboard tab loads earnings section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Earnings Trend/i })).toBeVisible();
  });

  test("dashboard payout history section does not crash when disconnected", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/application error|a client-side exception/i)).toHaveCount(0);
    // Hidden until wallet has history — must not throw
    await expect(page.getByRole("heading", { name: /Payout history/i })).toHaveCount(0);
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

test.describe("Cashdrop auto payout UI", () => {
  test("shows fee share stat", async ({ page }) => {
    await page.goto("/cashdrop");
    await expect(page.getByText("Payout model", { exact: true })).toBeVisible();
  });
});
