import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  useEpochCountdown: () => ({ formatted: "04h 22m 00s" }),
}));

describe("CashdropTab", () => {
  it("renders cashdrop section and epoch countdown", () => {
    render(<CashdropTab />);
    expect(screen.getByText("points.cashdropSection")).toBeInTheDocument();
    expect(screen.getByText("04h 22m 00s")).toBeInTheDocument();
  });

  it("shows connect wallet when disconnected and no rewards", () => {
    render(<CashdropTab />);
    expect(screen.getByText("common.connectWallet")).toBeInTheDocument();
  });

  it("calls navigation callbacks", () => {
    const onGoToPoints = vi.fn();
    const onGoToAffiliate = vi.fn();
    render(<CashdropTab onGoToPoints={onGoToPoints} onGoToAffiliate={onGoToAffiliate} />);

    fireEvent.click(screen.getByText("tabs.points"));
    fireEvent.click(screen.getByText("tabs.affiliate"));

    expect(onGoToPoints).toHaveBeenCalledOnce();
    expect(onGoToAffiliate).toHaveBeenCalledOnce();
  });
});
