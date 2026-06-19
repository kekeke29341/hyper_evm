"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowDownUp, ChevronDown, Loader2, ArrowRightLeft, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useChainId } from "wagmi";
import { BRIDGE_CHAINS, EVM_BRIDGE_CHAINS } from "@/lib/constants";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { MainCard, PrimaryButton } from "@/components/ui/shared";
import { getSlippageBps } from "@/components/layout/SettingsModal";
import { useLiFiBridge, useLiFiQuote, formatLifiAmount } from "@/lib/hooks/useLiFi";
import { useEffectiveChainId } from "@/lib/hooks/useEffectiveChainId";
import {
  getBridgeChain,
  getSwapTokensForChain,
  hyperEvmLifiNotice,
  isEvmBridgeRoute,
  cycleSwapToken,
  pickDefaultSwapToken,
  type SwapToken,
} from "@/lib/lifi/config";

const TOKEN_COLORS: Record<string, string> = {
  kHYPE: "bg-emerald-500",
  USDC: "bg-blue-500",
  ETH: "bg-indigo-500",
  WETH: "bg-indigo-500",
  WBTC: "bg-orange-500",
  DAI: "bg-yellow-500",
  USDT: "bg-teal-500",
};

function TokenRow({
  label,
  maxLabel,
  amount,
  onAmount,
  token,
  onToken,
  readOnly,
  tokenOptions,
}: {
  label: string;
  maxLabel: string;
  amount: string;
  onAmount: (v: string) => void;
  token: SwapToken;
  onToken: () => void;
  readOnly?: boolean;
  tokenOptions: SwapToken[];
}) {
  const canCycle = tokenOptions.length > 1;

  return (
    <div className="bg-zinc-800/40 rounded-xl p-4">
      <div className="flex justify-between text-xs text-zinc-500 mb-2">
        <span>{label}</span>
        <span>{maxLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          readOnly={readOnly}
          onChange={(e) => onAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.0"
          className="flex-1 bg-transparent text-2xl sm:text-3xl font-light text-white outline-none w-0 min-w-0"
        />
        <button
          type="button"
          onClick={onToken}
          disabled={!canCycle || readOnly}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-700/60 border border-zinc-600 shrink-0 disabled:opacity-70"
        >
          <span className={`w-6 h-6 rounded-full ${TOKEN_COLORS[token]}`} />
          <span className="font-medium">{token === "kHYPE" ? "HYPE" : token}</span>
          {canCycle && !readOnly && <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>
      </div>
    </div>
  );
}

export function DepositTab({ onGoToPosition }: { onGoToPosition?: () => void }) {
  const { showToast, openWalletModal, isConnected } = useApp();
  const { t } = useI18n();
  const walletChainId = useChainId();
  const appChainId = useEffectiveChainId();
  const [fromAmount, setFromAmount] = useState("");
  const [fromChain, setFromChain] = useState("ethereum");
  const [toChain] = useState("hyperevm");
  const [fromToken, setFromToken] = useState<SwapToken>("ETH");
  const [toToken] = useState<SwapToken>("USDC");

  const slippageBps = getSlippageBps();
  const isEvmBridge = isEvmBridgeRoute(fromChain, toChain);

  const lifiQuote = useLiFiQuote({
    fromChainId: fromChain,
    toChainId: toChain,
    fromToken,
    toToken,
    fromAmount,
    slippageBps,
    enabled: isEvmBridge && !!fromAmount,
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

  const fromTokenOptions = useMemo(() => getSwapTokensForChain(fromChain), [fromChain]);
  const toTokenOptions = useMemo(() => getSwapTokensForChain(toChain), [toChain]);
  const testnetNote = hyperEvmLifiNotice(walletChainId);

  const walletOnFromChain = useMemo(() => {
    const from = getBridgeChain(fromChain);
    if (!from) return false;
    if (from.id === "hyperevm") return walletChainId === 999;
    return from.walletChainIds.includes(walletChainId);
  }, [fromChain, walletChainId]);

  useEffect(() => {
    if (isBridgeSuccess) showToast(t("deposit.bridgeSuccess"));
  }, [isBridgeSuccess, showToast, t]);

  useEffect(() => {
    if (!getSwapTokensForChain(fromChain).includes(fromToken)) {
      setFromToken(pickDefaultSwapToken(fromChain, toToken));
    }
  }, [fromChain, fromToken, toToken]);

  const handleAction = async () => {
    if (!isConnected) {
      openWalletModal();
      return;
    }
    if (!isEvmBridge) {
      showToast(t("deposit.solanaUnsupported"));
      return;
    }
    if (!walletOnFromChain) {
      showToast(t("deposit.switchToFromChain"));
      return;
    }
    if (!lifiQuote.data) return;
    try {
      await executeBridge(lifiQuote.data);
    } catch {
      showToast(t("deposit.bridgeFailed"));
    }
  };

  const rate =
    fromAmount && bridgeAmountOut && parseFloat(fromAmount) > 0
      ? (parseFloat(bridgeAmountOut) / parseFloat(fromAmount)).toFixed(4)
      : "—";

  return (
    <MainCard>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-white">{t("deposit.title")}</h2>
        <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
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

      {appChainId === 998 && (
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200 leading-relaxed space-y-2">
          <p>{t("deposit.testnetDirectHint")}</p>
          {onGoToPosition && (
            <button
              type="button"
              onClick={onGoToPosition}
              className="text-emerald-300 font-medium hover:text-emerald-200 underline underline-offset-2"
            >
              {t("deposit.goToPosition")}
            </button>
          )}
        </div>
      )}

      {testnetNote && (
        <p className="text-[11px] text-amber-400/90 mb-3 px-2">{t("deposit.testnetNote")}</p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <select
          value={fromChain}
          onChange={(e) => {
            const chain = e.target.value;
            setFromChain(chain);
            if (!getSwapTokensForChain(chain).includes(fromToken)) {
              setFromToken(pickDefaultSwapToken(chain, toToken));
            }
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

      <TokenRow
        label={t("common.from")}
        maxLabel={t("deposit.anyToken")}
        amount={fromAmount}
        onAmount={setFromAmount}
        token={fromToken}
        onToken={() => setFromToken(cycleSwapToken(fromToken, fromChain, toToken))}
        tokenOptions={fromTokenOptions}
      />

      <div className="flex justify-center -my-2 relative z-10">
        <motion.div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-500">
          <ArrowDownUp className="w-5 h-5" />
        </motion.div>
      </div>

      <TokenRow
        label={t("common.to")}
        maxLabel={t("deposit.vaultTarget")}
        amount={bridgeAmountOut}
        onAmount={() => {}}
        token={toToken}
        onToken={() => {}}
        tokenOptions={toTokenOptions}
        readOnly
      />

      {lifiQuote.isFetching && (
        <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> {t("deposit.bridgeQuoteLoading")}
        </p>
      )}
      {lifiQuote.error && (
        <p className="text-xs text-red-400/90 mt-2">{(lifiQuote.error as Error).message}</p>
      )}

      <div className="mt-4 space-y-1 text-xs text-zinc-500">
        <p>
          1 {fromToken === "kHYPE" ? "HYPE" : fromToken} = {rate} {toToken}
        </p>
        <p>
          {t("deposit.slippage")}: {slippageBps / 100}% · {t("deposit.estGas")}:{" "}
          {lifiQuote.data?.estimate.gasCosts?.[0]?.amountUSD
            ? `$${lifiQuote.data.estimate.gasCosts[0].amountUSD}`
            : "—"}
        </p>
        {lifiQuote.data?.estimate.executionDuration !== undefined && (
          <p>
            {t("deposit.bridgeDuration")}: ~{lifiQuote.data.estimate.executionDuration}{" "}
            {t("deposit.bridgeMinutes")}
          </p>
        )}
      </div>

      <p className="mt-3 text-[11px] text-zinc-600">{t("deposit.afterBridge")}</p>

      <div className="mt-4">
        <PrimaryButton
          onClick={handleAction}
          disabled={isBridgePending || !fromAmount || !lifiQuote.data || lifiQuote.isFetching}
        >
          {isBridgePending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t("deposit.bridging")}
            </span>
          ) : isConnected ? (
            `${t("deposit.bridge")} → USDC`
          ) : (
            t("common.connectWallet")
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
