import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CashdropTab } from "@/components/tabs/CashdropTab";

vi.mock("@/lib/store", () => ({
  useApp: () => ({
    showToast: vi.fn(),
    isConnected: false,
    openWalletModal: vi.fn(),
  }),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/useDeFi", () => ({
  useCashdrop: () => ({
    hasDeployment: true,
    hasRewards: false,
    availableUsdc: "0.00",
    alreadyClaimed: false,
    expired: false,
    rootSet: false,
    claim: vi.fn(),
    isPending: false,
    isSuccess: false,
  }),
  useEpochCountdown: () => ({ formatted: "04h 22m 00s", isClaimWindow: false }),
}));

vi.mock("@/lib/hooks/useAccruingRewards", () => ({
  useAccruingRewards: () => ({
    hasPosition: false,
    hasUnclaimed: false,
    isAccruing: false,
    isLoading: false,
    isError: false,
    usesExactEstimate: false,
    amountFormatted: "0.000000",
    ratePerSecondFormatted: "0.000000",
    ratePerMinuteFormatted: "0.000000",
  }),
}));

describe("CashdropTab", () => {
  it("renders cashdrop section and claim window countdown", () => {
    render(<CashdropTab />);
    expect(screen.getByText("cashdrop.title")).toBeInTheDocument();
    expect(screen.getByText("04h 22m 00s")).toBeInTheDocument();
  });

  it("shows connect wallet when disconnected and no rewards", () => {
    render(<CashdropTab />);
    expect(screen.getByText("common.connectWallet")).toBeInTheDocument();
  });

  it("shows USDC-only harvest disclosure notes", () => {
    render(<CashdropTab />);
    expect(screen.getByText("cashdrop.usdcOnlyNote")).toBeInTheDocument();
    expect(screen.getByText("cashdrop.hypeFeeNote")).toBeInTheDocument();
  });
});
