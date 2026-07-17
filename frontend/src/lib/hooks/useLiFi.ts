"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useConfig,
  useConnection,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { getChainId, getPublicClient } from "wagmi/actions";
import { encodeFunctionData, formatUnits, parseUnits, maxUint256, type Hex } from "viem";
import {
  getLifiChainId,
  isCrossChainBridge,
  isEvmBridgeRoute,
  resolveLifiToken,
} from "@/lib/lifi/config";
import { getBridgeApprovalTarget, quoteNeedsErc20Approval } from "@/lib/lifi/bridgeApproval";
import type { LifiQuote, LifiStatus } from "@/lib/lifi/types";
import { abis } from "@/lib/contracts";

/** Li.FI accepts any EVM address for quote previews when wallet is disconnected. */
export const LIFI_QUOTE_PREVIEW_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  WBTC: 8,
};

export function tokenDecimalsForSymbol(symbol: string): number {
  return TOKEN_DECIMALS[symbol] ?? 18;
}

async function ensureWalletOnSourceChain(
  config: ReturnType<typeof useConfig>,
  fromChain: number,
  switchToChain: (chainId: number) => Promise<void>
) {
  // Always request a network switch so mobile wallets (Bitget, etc.) sync before approve.
  await switchToChain(fromChain);

  const activeChain = getChainId(config);
  if (activeChain !== fromChain) {
    throw new Error(
      `Wallet is on chain ${activeChain}. Switch to chain ${fromChain} in your wallet, then try again.`
    );
  }
}

export function useLiFiQuote({
  fromChainId,
  toChainId,
  fromToken,
  toToken,
  fromAmount,
  fromTokenDecimals,
  slippageBps,
  enabled,
}: {
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromTokenDecimals: number;
  slippageBps: number;
  enabled: boolean;
}) {
  const { address } = useConnection();
  const isBridge = isCrossChainBridge(fromChainId, toChainId);
  const evmRoute = isEvmBridgeRoute(fromChainId, toChainId);

  let parsedAmount: bigint | null = null;
  try {
    parsedAmount =
      fromAmount && parseFloat(fromAmount) > 0
        ? parseUnits(fromAmount, fromTokenDecimals)
        : null;
  } catch {
    parsedAmount = null;
  }

  const lifiFrom = getLifiChainId(fromChainId);
  const lifiTo = getLifiChainId(toChainId);
  const quoteFromAddress = address ?? LIFI_QUOTE_PREVIEW_ADDRESS;

  return useQuery({
    queryKey: [
      "lifi-quote",
      lifiFrom,
      lifiTo,
      fromToken,
      toToken,
      fromAmount,
      quoteFromAddress,
      slippageBps,
    ],
    enabled:
      enabled &&
      isBridge &&
      evmRoute &&
      lifiFrom !== null &&
      lifiTo !== null &&
      parsedAmount !== null,
    refetchInterval: 15_000,
    queryFn: async (): Promise<LifiQuote> => {
      const params = new URLSearchParams({
        fromChain: String(lifiFrom),
        toChain: String(lifiTo),
        fromToken: resolveLifiToken(fromChainId, fromToken),
        toToken: resolveLifiToken(toChainId, toToken),
        fromAmount: parsedAmount!.toString(),
        fromAddress: quoteFromAddress,
        slippage: String(slippageBps / 10_000),
      });
      const res = await fetch(`/api/lifi/quote?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      return data as LifiQuote;
    },
  });
}

export function useLiFiBridge(switchToChain: (chainId: number) => Promise<void>) {
  const { address } = useConnection();
  const config = useConfig();
  const { sendTransactionAsync, data: txHash, isPending: isSending } = useSendTransaction();
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });
  const [status, setStatus] = useState<LifiStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [bridgePhase, setBridgePhase] = useState<"idle" | "approving" | "bridging">("idle");

  const pollStatus = useCallback(
    async (hash: Hex, fromChain: number, toChain: number) => {
      setPolling(true);
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const params = new URLSearchParams({
          txHash: hash,
          fromChain: String(fromChain),
          toChain: String(toChain),
        });
        const res = await fetch(`/api/lifi/status?${params}`);
        if (!res.ok) continue;
        const data = (await res.json()) as LifiStatus;
        setStatus(data);
        if (data.status === "DONE" || data.status === "FAILED") {
          setPolling(false);
          return data;
        }
      }
      setPolling(false);
      return null;
    },
    []
  );

  const execute = useCallback(
    async (quote: LifiQuote) => {
      if (!address || !quote.transactionRequest) {
        throw new Error("Quote or wallet unavailable");
      }

      const txReq = quote.transactionRequest;
      const fromChain = quote.action.fromChainId;
      const fromClient = getPublicClient(config, { chainId: fromChain });
      if (!fromClient) {
        throw new Error(`No RPC client configured for bridge source chain ${fromChain}`);
      }

      await ensureWalletOnSourceChain(config, fromChain, switchToChain);

      if (quoteNeedsErc20Approval(quote)) {
        const target = getBridgeApprovalTarget(quote)!;
        let allowance = 0n;
        try {
          allowance = (await fromClient.readContract({
            address: target.token,
            abi: abis.erc20,
            functionName: "allowance",
            args: [address, target.spender],
          })) as bigint;
        } catch {
          // Public RPC can fail on mobile — proceed to wallet approve popup.
        }

        if (allowance < target.needed) {
          setBridgePhase("approving");
          try {
            // sendTransaction skips viem simulateContract (eth_call via multicall3) which
            // fails when mainnet.base.org is unreachable from in-app browsers.
            const approvalHash = await sendTransactionAsync({
              account: address,
              to: target.token,
              data: encodeFunctionData({
                abi: abis.erc20,
                functionName: "approve",
                args: [target.spender, maxUint256],
              }),
              chainId: fromChain,
            });
            await fromClient.waitForTransactionReceipt({ hash: approvalHash });
          } finally {
            setBridgePhase("idle");
          }
        }
      }

      if (txReq.chainId !== undefined && Number(txReq.chainId) !== fromChain) {
        throw new Error("Li.FI transaction chainId does not match quote source chain");
      }

      setBridgePhase("bridging");
      try {
        const hash = await sendTransactionAsync({
          account: address,
          to: txReq.to,
          data: txReq.data,
          value: BigInt(txReq.value ?? "0"),
          chainId: txReq.chainId,
          gas: txReq.gasLimit ? BigInt(txReq.gasLimit) : undefined,
        });

        void pollStatus(hash, quote.action.fromChainId, quote.action.toChainId);
        return hash;
      } finally {
        setBridgePhase("idle");
      }
    },
    [address, config, switchToChain, sendTransactionAsync, pollStatus]
  );

  useEffect(() => {
    if (isTxSuccess && txHash) setPolling(true);
  }, [isTxSuccess, txHash]);

  return {
    execute,
    status,
    bridgePhase,
    isPending: isSending || isTxConfirming || polling,
    isSuccess: isTxSuccess,
    txHash,
  };
}

export function formatLifiAmount(amount: string, decimals: number): string {
  try {
    return formatUnits(BigInt(amount), decimals);
  } catch {
    return "0";
  }
}
