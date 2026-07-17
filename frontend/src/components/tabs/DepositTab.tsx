"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { ArrowDownUp, Loader2, ArrowRightLeft, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useChainId } from "wagmi";
import { BRIDGE_CHAINS, EVM_BRIDGE_CHAINS } from "@/lib/constants";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { MainCard, PrimaryButton } from "@/components/ui/shared";
import { getSlippageBps } from "@/components/layout/SettingsModal";
import { useLiFiBridge, useLiFiQuote, formatLifiAmount } from "@/lib/hooks/useLiFi";
import { quoteNeedsErc20Approval } from "@/lib/lifi/bridgeApproval";
import { useWallet } from "@/lib/hooks/useWallet";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import { hyperEvmMainnet, hyperEvmTestnet } from "@/lib/wagmi/config";
import { tabPath } from "@/lib/routes";
import {
  getBridgeSourceWalletChainId,
  hyperEvmLifiNotice,
  isEvmBridgeRoute,
} from "@/lib/lifi/config";
import {
  bridgeTokenFromSymbol,
  pickDefaultBridgeToken,
  type BridgeToken,
} from "@/lib/lifi/tokens";
import { TokenSelectDropdown } from "@/components/deposit/TokenSelectDropdown";
import {
  formatBridgeError,
  formatLifiBridgeStatus,
  extractErrorDetail,
  type BridgeErrorLabels,
} from "@/lib/lifi/errors";

function applyParams(text: string, params: Record<string, string>) {
  return Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), text);
}

export function DepositTab() {
  const { showToast, openWalletModal, isConnected } = useApp();
  const { t } = useI18n();
  const walletChainId = useChainId();
  const { switchNetwork, isSwitching } = useWallet();
  const appChainId = useEffectiveChainId();
  const [fromAmount, setFromAmount] = useState("");
  const [fromChain, setFromChain] = useState("ethereum");
  const [toChain] = useState("hyperevm");
  const [fromToken, setFromToken] = useState<BridgeToken>(() =>
    pickDefaultBridgeToken("ethereum", "USDC")
  );
  const toToken = useMemo(
    () => bridgeTokenFromSymbol("hyperevm", "USDC"),
    []
  );

  const slippageBps = getSlippageBps();
  const isEvmBridge = isEvmBridgeRoute(fromChain, toChain);

  const lifiQuote = useLiFiQuote({
    fromChainId: fromChain,
    toChainId: toChain,
    fromToken: fromToken.address,
    toToken: toToken.address,
    fromAmount,
    fromTokenDecimals: fromToken.decimals,
    slippageBps,
    enabled: isEvmBridge && !!fromAmount,
  });

  const {
    execute: executeBridge,
    isPending: isBridgePending,
    isSuccess: isBridgeSuccess,
    status: bridgeStatus,
    bridgePhase,
  } = useLiFiBridge(switchNetwork);
  const [actionError, setActionError] = useState<string | null>(null);

  const bridgeErrorLabels = useMemo<BridgeErrorLabels>(
    () => ({
      userRejected: t("deposit.errorUserRejected"),
      insufficientFunds: t("deposit.errorInsufficientFunds"),
      wrongChain: t("deposit.errorWrongChain"),
      approvalFailed: t("deposit.errorApprovalFailed"),
      gasFailed: t("deposit.errorGasFailed"),
      networkFailed: t("deposit.errorNetworkFailed"),
      rateLimited: t("deposit.errorRateLimited"),
      bridgeIncomplete: t("deposit.errorBridgeIncomplete"),
      switchNetworkFailed: t("deposit.switchToFromChainFailed"),
      unknown: t("deposit.errorUnknown"),
    }),
    [t]
  );

  const reportActionError = useCallback(
    (message: string, raw?: unknown) => {
      const detail = raw ? extractErrorDetail(raw) : null;
      const full =
        detail && detail !== message && !message.includes(detail)
          ? `${message}\n${detail}`
          : message;
      setActionError(full);
      showToast(message);
    },
    [showToast]
  );

  const bridgeAmountOut = useMemo(() => {
    if (!lifiQuote.data) return "";
    return formatLifiAmount(
      lifiQuote.data.estimate.toAmount,
      lifiQuote.data.action.toToken.decimals
    );
  }, [lifiQuote.data]);

  const testnetNote = hyperEvmLifiNotice(walletChainId);
  const fromChainLabel = BRIDGE_CHAINS.find((c) => c.id === fromChain)?.label ?? fromChain;
  const fromWalletChainId = getBridgeSourceWalletChainId(fromChain);

  const walletOnFromChain = useMemo(() => {
    if (!fromWalletChainId) return false;
    return walletChainId === fromWalletChainId;
  }, [fromWalletChainId, walletChainId]);

  const needsMainnetSwitch =
    isConnected && walletChainId === hyperEvmTestnet.id;

  const needsChainSwitch =
    isConnected &&
    !needsMainnetSwitch &&
    !!fromAmount &&
    !walletOnFromChain &&
    fromWalletChainId !== null;

  useEffect(() => {
    setActionError(null);
  }, [fromAmount, fromChain, fromToken.address]);

  useEffect(() => {
    if (isBridgeSuccess) {
      setActionError(null);
      showToast(t("deposit.bridgeSuccess"));
    }
  }, [isBridgeSuccess, showToast, t]);

  useEffect(() => {
    const statusMessage = formatLifiBridgeStatus(
      bridgeStatus?.status,
      bridgeStatus?.substatus,
      bridgeErrorLabels
    );
    if (statusMessage) reportActionError(statusMessage);
  }, [bridgeStatus, bridgeErrorLabels, reportActionError]);

  const handleAction = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!isEvmBridge) {
      showToast(t("deposit.solanaUnsupported"));
      return;
    }
    if (needsMainnetSwitch) {
      try {
        await switchNetwork(hyperEvmMainnet.id);
        setActionError(null);
        showToast(t("deposit.switchedToMainnet"));
      } catch (err) {
        reportActionError(formatBridgeError(err, bridgeErrorLabels), err);
      }
      return;
    }
    if (needsChainSwitch && fromWalletChainId !== null) {
      try {
        await switchNetwork(fromWalletChainId);
        setActionError(null);
        showToast(applyParams(t("deposit.switchedToFromChain"), { chain: fromChainLabel }));
      } catch (err) {
        reportActionError(formatBridgeError(err, bridgeErrorLabels), err);
      }
      return;
    }
    if (!lifiQuote.data) return;
    try {
      setActionError(null);
      await executeBridge(lifiQuote.data);
    } catch (err) {
      reportActionError(formatBridgeError(err, bridgeErrorLabels), err);
    }
  };

  const quoteErrorMessage = lifiQuote.error
    ? formatBridgeError(lifiQuote.error, bridgeErrorLabels)
    : null;

  const rate =
    fromAmount && bridgeAmountOut && parseFloat(fromAmount) > 0
      ? (parseFloat(bridgeAmountOut) / parseFloat(fromAmount)).toFixed(4)
      : "—";
  const actionDisabled =
    isBridgePending ||
    isSwitching ||
    needsMainnetSwitch ||
    !fromAmount ||
    (!!fromAmount && (lifiQuote.isFetching || !lifiQuote.data));

  const showApproveHint =
    isConnected &&
    !!lifiQuote.data &&
    !needsMainnetSwitch &&
    !needsChainSwitch &&
    quoteNeedsErc20Approval(lifiQuote.data);

  const tokenPickerLabels = {
    searchPlaceholder: t("deposit.tokenSearch"),
    popularLabel: t("deposit.popularTokens"),
    emptyLabel: t("deposit.noTokensFound"),
    loadingLabel: t("deposit.tokensLoading"),
  };

  return (
    <MainCard>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <h2 className="text-lg font-semibold text-white">{t("deposit.title")}</h2>
        <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-medium shrink-0">
          {t("deposit.zeroFees")}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-4">{t("deposit.subtitle")}</p>

      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 mb-4">
        <ArrowRightLeft className="w-4 h-4 shrink-0" />
        {t("deposit.bridge")}: {BRIDGE_CHAINS.find((c) => c.id === fromChain)?.label} → HyperEVM USDC
        {lifiQuote.data?.toolDetails?.name && (
          <span className="text-zinc-400 sm:ml-auto">
            {t("deposit.bridgeVia")} {lifiQuote.data.toolDetails.name}
          </span>
        )}
      </div>

      {needsMainnetSwitch && (
        <div className="mb-4 px-3 py-3 rounded-xl bg-amber-500/10 border border-amber-500/35 text-xs text-amber-100 leading-relaxed space-y-3">
          <div>
            <p className="font-medium text-amber-200">{t("deposit.mainnetRequiredTitle")}</p>
            <p className="mt-1 text-amber-100/80">{t("deposit.mainnetRequiredBody")}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleAction()}
            disabled={isSwitching}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-medium border border-amber-500/50 text-amber-100 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-60 transition-colors"
          >
            {isSwitching ? t("deposit.switchingChain") : t("deposit.switchToMainnetButton")}
          </button>
        </div>
      )}

      {appChainId === 998 && !needsMainnetSwitch && (
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200 leading-relaxed space-y-2">
          <p>{t("deposit.testnetDirectHint")}</p>
          <Link
            href={tabPath("liquidity")}
            className="inline-block text-emerald-300 font-medium hover:text-emerald-200 underline underline-offset-2"
          >
            {t("deposit.goToPosition")}
          </Link>
        </div>
      )}

      {testnetNote && !needsMainnetSwitch && (
        <p className="text-[11px] text-amber-400/90 mb-3 px-2">{t("deposit.testnetNote")}</p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <select
          value={fromChain}
          onChange={(e) => {
            const chain = e.target.value;
            setFromChain(chain);
            setFromToken(pickDefaultBridgeToken(chain, toToken.symbol));
          }}
          className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-zinc-300"
        >
          {EVM_BRIDGE_CHAINS.filter((c) => c.id !== "hyperevm").map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-zinc-400 flex items-center">
          HyperEVM · USDC
        </div>
      </div>

      <div className="bg-zinc-800/40 rounded-xl p-4">
        <div className="flex justify-between text-xs text-zinc-500 mb-2">
          <span>{t("common.from")}</span>
          <span>{t("deposit.anyToken")}</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
            className="flex-1 bg-transparent text-2xl sm:text-3xl font-light text-white outline-none w-0 min-w-0"
          />
          <TokenSelectDropdown
            chainUiId={fromChain}
            value={fromToken}
            onChange={setFromToken}
            excludeSymbol={toToken.symbol}
            searchPlaceholder={tokenPickerLabels.searchPlaceholder}
            popularLabel={tokenPickerLabels.popularLabel}
            emptyLabel={tokenPickerLabels.emptyLabel}
            loadingLabel={tokenPickerLabels.loadingLabel}
          />
        </div>
      </div>

      <div className="flex justify-center -my-2 relative z-10">
        <motion.div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-500">
          <ArrowDownUp className="w-5 h-5" />
        </motion.div>
      </div>

      <div className="bg-zinc-800/40 rounded-xl p-4">
        <div className="flex justify-between text-xs text-zinc-500 mb-2">
          <span>{t("common.to")}</span>
          <span>{t("deposit.vaultTarget")}</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={bridgeAmountOut}
            readOnly
            placeholder="0.0"
            className="flex-1 bg-transparent text-2xl sm:text-3xl font-light text-white outline-none w-0 min-w-0"
          />
          <TokenSelectDropdown
            chainUiId={toChain}
            value={toToken}
            disabled
            onChange={() => {}}
            searchPlaceholder={tokenPickerLabels.searchPlaceholder}
            popularLabel={tokenPickerLabels.popularLabel}
            emptyLabel={tokenPickerLabels.emptyLabel}
            loadingLabel={tokenPickerLabels.loadingLabel}
          />
        </div>
      </div>

      {lifiQuote.isFetching && (
        <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> {t("deposit.bridgeQuoteLoading")}
        </p>
      )}
      {quoteErrorMessage && (
        <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-medium text-red-300">{t("deposit.bridgeErrorTitle")}</p>
          <p className="text-xs text-red-200/90 mt-1 break-words">{quoteErrorMessage}</p>
        </div>
      )}

      <div className="mt-4 space-y-1 text-xs text-zinc-500">
        <p>
          1 {fromToken.symbol} = {rate} {toToken.symbol}
        </p>
        <p>
          {t("deposit.slippage")}: {slippageBps / 100}% · {t("deposit.estGas")}:{" "}
          {lifiQuote.data?.estimate.gasCosts?.[0]?.amountUSD
            ? `$${lifiQuote.data.estimate.gasCosts[0].amountUSD}`
            : "—"}
        </p>
        {lifiQuote.data?.estimate.executionDuration !== undefined && (
          <p>
            {t("deposit.bridgeDuration")}: ~
            {lifiQuote.data.estimate.executionDuration}{" "}
            {t("deposit.bridgeMinutes")}
          </p>
        )}
      </div>

      <p className="mt-3 text-[11px] text-zinc-600">{t("deposit.afterBridge")}</p>

      {!isConnected && !!fromAmount && (
        <p className="mt-2 text-[11px] text-zinc-500">{t("deposit.connectToBridge")}</p>
      )}
      {isConnected && !fromAmount && (
        <p className="mt-2 text-[11px] text-zinc-500">{t("deposit.enterAmount")}</p>
      )}
      {!!fromAmount && !lifiQuote.data && !lifiQuote.isFetching && (
        <p className="mt-2 text-[11px] text-amber-400/90">{t("deposit.noRoute")}</p>
      )}
      {needsChainSwitch && (
        <p className="mt-2 text-[11px] text-amber-400/90">
          {t("deposit.switchToFromChain")} ({fromChainLabel})
        </p>
      )}

      {showApproveHint && !isBridgePending && (
        <p className="mt-2 text-[11px] text-zinc-500">{t("deposit.approveStepHint")}</p>
      )}

      {isBridgePending && bridgePhase === "approving" && (
        <p className="mt-2 text-[11px] text-cyan-400/90">{t("deposit.approveStepHint")}</p>
      )}
      {isBridgePending && bridgePhase === "bridging" && (
        <p className="mt-2 text-[11px] text-cyan-400/90">{t("deposit.bridgingStepHint")}</p>
      )}

      {actionError && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs font-medium text-red-300">{t("deposit.bridgeErrorTitle")}</p>
          <p className="text-xs text-red-200/90 mt-1 break-words whitespace-pre-wrap">{actionError}</p>
        </div>
      )}

      <div className="mt-4">
        <PrimaryButton
          onClick={() => void handleAction()}
          disabled={isConnected ? (needsMainnetSwitch ? isSwitching : actionDisabled) : isBridgePending}
        >
          {isBridgePending || isSwitching ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />{" "}
              {isSwitching
                ? t("deposit.switchingChain")
                : bridgePhase === "approving"
                  ? t("deposit.approving")
                  : t("deposit.bridging")}
            </span>
          ) : !isConnected ? (
            t("common.connectWallet")
          ) : needsMainnetSwitch ? (
            t("deposit.switchToMainnetButton")
          ) : needsChainSwitch ? (
            applyParams(t("deposit.switchToFromChainButton"), { chain: fromChainLabel })
          ) : (
            `${t("deposit.bridge")} → USDC`
          )}
        </PrimaryButton>
      </div>

      <a
        href="https://li.fi/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400"
      >
        {t("deposit.poweredBy")} <ExternalLink className="w-3 h-3" />
      </a>
    </MainCard>
  );
}
