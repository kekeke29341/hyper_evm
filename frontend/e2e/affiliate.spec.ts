import { test, expect } from "@playwright/test";
import { prepareAppLocale } from "./helpers/ui";

test.beforeEach(async ({ page }) => {
  await prepareAppLocale(page);
});

test.describe("Affiliate tab", () => {
  test("guest mode shows connect-to-create prompt", async ({ page }) => {
    await page.goto("/affiliate");

    await expect(page.getByText(/Connect your wallet to create a referral code/i)).toBeVisible();
    await expect(page.getByText(/Your referral link/i)).toHaveCount(0);
    await expect(page.getByPlaceholder("MYCODE")).toHaveCount(0);
  });

  test("explains referral normalization and invite code field", async ({ page }) => {
    await page.goto("/affiliate");

    await expect(page.getByText(/fixed USDC pool/i)).toBeVisible();
    await expect(page.getByPlaceholder("XM79B4")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Apply$/i })).toBeVisible();
  });
});
