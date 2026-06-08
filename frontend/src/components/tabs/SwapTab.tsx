"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowDownUp, ChevronDown, Loader2, ArrowRightLeft, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useChainId } from "wagmi";
import { BRIDGE_CHAINS } from "@/lib/constants";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { MainCard, PrimaryButton, InfoBanner } from "@/components/ui/shared";
import { getSlippageBps } from "@/components/layout/SettingsModal";
import {
  useDeployment,
  useSwap,
  useSwapQuote,
  useTokenBalance,
} from "@/lib/hooks/useDeFi";
import {
  useLiFiBridge,
  useLiFiQuote,
  formatLifiAmount,
} from "@/lib/hooks/useLiFi";
import {
  getBridgeChain,
  hyperEvmLifiNotice,
  isCrossChainBridge,
  isEvmBridgeRoute,
} from "@/lib/lifi/config";
import type { TokenSymbol } from "@/lib/contracts";

function TokenRow({
  label,
  maxLabel,
  amount,
  onAmount,
  token,
  onToken,
  balance,
  readOnly,
}: {
  label: string;
  maxLabel: string;
  amount: string;
  onAmount: (v: string) => void;
  token: string;
  onToken: () => void;
  balance: string;
  readOnly?: boolean;
}) {
  return (
    <div className="bg-zinc-800/40 rounded-xl p-4">
      <div className="flex justify-between text-xs text-zinc-500 mb-2">
        <span>{label}</span>
        {!readOnly && (
          <button type="button" className="hover:text-cyan-400" onClick={() => onAmount(balance)}>
            {maxLabel}
          </button>
        )}
        {readOnly && <span>{maxLabel}</span>}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          readOnly={readOnly}
          onChange={(e) => onAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          className="flex-1 bg-transparent text-3xl font-light text-white outline-none w-0 min-w-0"
        />
        <button
          type="button"
          onClick={onToken}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-700/60 border border-zinc-600 shrink-0"
        >
          <span className="w-6 h-6 rounded-full bg-emerald-500" />
          <span className="font-medium">{token}</span>
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        </button>
      </div>
    </div>
  );
}

export function SwapTab() {
  const { isConnected, showToast, openWalletModal } = useApp();
  const { t } = useI18n();
  const walletChainId = useChainId();
  const deployment = useDeployment();
  const [fromAmount, setFromAmount] = useState("");
  const [fromChain, setFromChain] = useState("hyperevm");
  const [toChain, setToChain] = useState("hyperevm");
  const [fromToken, setFromToken] = useState<TokenSymbol>("kHYPE");
  const [toToken, setToToken] = useState<TokenSymbol>("USDC");

  const slippageBps = getSlippageBps();
  const isBridge = isCrossChainBridge(fromChain, toChain);
  const isEvmBridge = isEvmBridgeRoute(fromChain, toChain);
  const useLocalDex = !isBridge && !!deployment;

  const fromBal = useTokenBalance(fromToken);
  const toBal = useTokenBalance(toToken);
  const { amountOut: localAmountOut } = useSwapQuote(fromToken, toToken, fromAmount);
  const { swap, isPending: isSwapPending, isSuccess: isSwapSuccess } = useSwap(fromToken, toToken);

  const lifiQuote = useLiFiQuote({
    fromChainId: fromChain,
    toChainId: toChain,
    fromToken,
    toToken,
    fromAmount,
    slippageBps,
    enabled: isBridge && isEvmBridge,
  });

  const { execute: executeBridge, isPending: isBridgePending, isSuccess: isBridgeSuccess } =
    useLiFiBridge();

  const bridgeAmountOut = useMemo(() => {
    if (!lifiQuote.data) return "";
    return formatLifiAmount(
      lifiQuote.data.estimate.toAmount,
      lifiQuote.data.action.toToken.decimals
    );
  }, [lifiQuote.data]);

  const amountOut = isBridge ? bridgeAmountOut : localAmountOut;
  const maxLabel = `${t("common.max")} · ${t("common.balance")}: ${fromBal.balance}`;
  const testnetNote = hyperEvmLifiNotice(walletChainId);
  const walletOnFromChain = useMemo(() => {
    if (!isBridge) return true;
    const from = getBridgeChain(fromChain);
    if (!from) return false;
    if (from.id === "hyperevm") return walletChainId === 999;
    return from.walletChainIds.includes(walletChainId);
  }, [fromChain, walletChainId, isBridge]);

  useEffect(() => {
    if (isSwapSuccess) {
      showToast(t("swap.swapSuccess"));
      setFromAmount("");
      fromBal.refetch();
      toBal.refetch();
    }
  }, [isSwapSuccess, showToast, fromBal, toBal, t]);

  useEffect(() => {
    if (isBridgeSuccess) showToast(t("swap.bridgeSuccess"));
  }, [isBridgeSuccess, showToast, t]);

  const flip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromChain(toChain);
    setToChain(fromChain);
    setFromAmount(amountOut || "");
  };

  const handleAction = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }

    if (isBridge) {
      if (!isEvmBridge) {
        showToast(t("swap.solanaUnsupported"));
        return;
      }
      if (!walletOnFromChain) {
        showToast(t("swap.switchToFromChain"));
        return;
      }
      if (!lifiQuote.data) return;
      try {
        await executeBridge(lifiQuote.data);
      } catch {
        showToast(t("swap.bridgeFailed"));
      }
      return;
    }

    if (!deployment) {
      showToast(t("swap.deployHint"));
      return;
    }
    if (!fromAmount || parseFloat(fromAmount) <= 0) return;
    try {
      await swap(fromAmount, slippageBps);
    } catch {
      showToast(t("swap.swapFailed"));
    }
  };

  const rate =
    fromAmount && amountOut && parseFloat(fromAmount) > 0
      ? (parseFloat(amountOut) / parseFloat(fromAmount)).toFixed(4)
      : "—";

  const isPending = isBridge ? isBridgePending : isSwapPending;
  const actionLabel = isBridge
    ? isConnected
      ? `${t("swap.bridge")} ${fromChain} → ${toChain}`
      : t("common.connectWallet")
    : isConnected
      ? t("common.swap")
      : t("common.connectWallet");

  return (
    <MainCard>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-white">{t("swap.title")}</h2>
        <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
          {t("swap.zeroFees")}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-4">{t("swap.noSpreads")}</p>

      {isBridge && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 mb-4">
          <ArrowRightLeft className="w-4 h-4 shrink-0" />
          {t("swap.bridge")}: {BRIDGE_CHAINS.find((c) => c.id === fromChain)?.label} →{" "}
          {BRIDGE_CHAINS.find((c) => c.id === toChain)?.label}
          {lifiQuote.data?.toolDetails?.name && (
            <span className="ml-auto text-zinc-400">
              {t("swap.bridgeVia")} {lifiQuote.data.toolDetails.name}
            </span>
          )}
        </div>
      )}

      {testnetNote && isBridge && (
        <p className="text-[11px] text-amber-400/90 mb-3 px-2">{t("swap.testnetLifiNote")}</p>
      )}

      <InfoBanner text={t("swap.pointsInfo")} />

      {!deployment && useLocalDex && (
        <details className="mt-3 text-xs text-amber-400/80">
          <summary className="cursor-pointer hover:text-amber-300">{t("swap.devSetup")}</summary>
          <p className="mt-1 pl-2 border-l border-amber-500/30">
            Connect MetaMask to Anvil (31337) or deploy to HyperEVM Testnet (998). Run{" "}
            <code className="text-amber-300">scripts/deploy-testnet.sh</code>
          </p>
        </details>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3 mt-4">
        <select
          value={fromChain}
          onChange={(e) => setFromChain(e.target.value)}
          className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-zinc-300"
        >
          {BRIDGE_CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={toChain}
          onChange={(e) => setToChain(e.target.value)}
          className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-2 text-zinc-300"
        >
          {BRIDGE_CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <TokenRow
        label={t("common.from")}
        maxLabel={maxLabel}
        amount={fromAmount}
        onAmount={setFromAmount}
        token={fromToken}
        onToken={() =>
          setFromToken((["kHYPE", "USDC"] as TokenSymbol[])[fromToken === "kHYPE" ? 1 : 0])
        }
        balance={fromBal.balance}
      />

      <div className="flex justify-center -my-2 relative z-10">
        <motion.button
          type="button"
          whileHover={{ scale: 1.1, rotate: 180 }}
          onClick={flip}
          className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-cyan-500/50"
        >
          <ArrowDownUp className="w-5 h-5" />
        </motion.button>
      </div>

      <TokenRow
        label={t("common.to")}
        maxLabel={`${t("common.balance")}: ${toBal.balance}`}
        amount={amountOut}
        onAmount={() => {}}
        token={toToken}
        onToken={() =>
          setToToken((["kHYPE", "USDC"] as TokenSymbol[])[toToken === "kHYPE" ? 1 : 0])
        }
        balance={toBal.balance}
        readOnly
      />

      {isBridge && lifiQuote.isFetching && (
        <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> {t("swap.bridgeQuoteLoading")}
        </p>
      )}
      {isBridge && lifiQuote.error && (
        <p className="text-xs text-red-400/90 mt-2">
          {(lifiQuote.error as Error).message}
        </p>
      )}

      <div className="mt-4 space-y-1 text-xs text-zinc-500">
        <p>
          1 {fromToken} = {rate} {toToken}
        </p>
        <p>
          {t("swap.slippage")}: {slippageBps / 100}% · {t("swap.estGas")}:{" "}
          {isBridge && lifiQuote.data?.estimate.gasCosts?.[0]?.amountUSD
            ? `$${lifiQuote.data.estimate.gasCosts[0].amountUSD}`
            : "~0.002 HYPE"}
        </p>
        {isBridge && lifiQuote.data?.estimate.executionDuration !== undefined && (
          <p>
            {t("swap.bridgeDuration")}: ~{lifiQuote.data.estimate.executionDuration}{" "}
            {t("swap.bridgeMinutes")}
          </p>
        )}
      </div>

      <div className="mt-4">
        <PrimaryButton
          onClick={handleAction}
          disabled={
            isPending ||
            (isBridge && (!lifiQuote.data || lifiQuote.isFetching)) ||
            (!isBridge && !fromAmount)
          }
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t("common.swapping")}
            </span>
          ) : (
            actionLabel
          )}
        </PrimaryButton>
      </div>

      <a
        href="https://li.fi/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400"
      >
        {t("swap.poweredBy")} <ExternalLink className="w-3 h-3" />
      </a>
    </MainCard>
  );
}
