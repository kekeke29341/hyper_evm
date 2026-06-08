"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection, usePublicClient, useSendTransaction, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";
import {
  getLifiChainId,
  isCrossChainBridge,
  isEvmBridgeRoute,
  resolveLifiToken,
} from "@/lib/lifi/config";
import type { LifiQuote, LifiStatus } from "@/lib/lifi/types";
import { abis } from "@/lib/contracts";

function tokenDecimals(symbol: string): number {
  return symbol === "USDC" ? 6 : 18;
}

export function useLiFiQuote({
  fromChainId,
  toChainId,
  fromToken,
  toToken,
  fromAmount,
  slippageBps,
  enabled,
}: {
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
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
        ? parseUnits(fromAmount, tokenDecimals(fromToken))
        : null;
  } catch {
    parsedAmount = null;
  }

  const lifiFrom = getLifiChainId(fromChainId);
  const lifiTo = getLifiChainId(toChainId);

  return useQuery({
    queryKey: ["lifi-quote", lifiFrom, lifiTo, fromToken, toToken, fromAmount, address, slippageBps],
    enabled:
      enabled &&
      isBridge &&
      evmRoute &&
      lifiFrom !== null &&
      lifiTo !== null &&
      parsedAmount !== null &&
      !!address,
    refetchInterval: 15_000,
    queryFn: async (): Promise<LifiQuote> => {
      const params = new URLSearchParams({
        fromChain: String(lifiFrom),
        toChain: String(lifiTo),
        fromToken: resolveLifiToken(fromChainId, fromToken),
        toToken: resolveLifiToken(toChainId, toToken),
        fromAmount: parsedAmount!.toString(),
        fromAddress: address!,
        slippage: String(slippageBps / 10_000),
      });
      const res = await fetch(`/api/lifi/quote?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      return data as LifiQuote;
    },
  });
}

export function useLiFiBridge() {
  const { address } = useConnection();
  const publicClient = usePublicClient();
  const { sendTransactionAsync, data: txHash, isPending: isSending } = useSendTransaction();
  const { writeContractAsync, data: approveHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [status, setStatus] = useState<LifiStatus | null>(null);
  const [polling, setPolling] = useState(false);

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
      if (!address || !publicClient || !quote.transactionRequest) {
        throw new Error("Quote or wallet unavailable");
      }

      const txReq = quote.transactionRequest;
      const fromChain = quote.action.fromChainId;
      const fromToken = quote.action.fromToken;
      const approval = quote.estimate.approvalAddress as Address | undefined;

      if (
        approval &&
        fromToken.address !== "0x0000000000000000000000000000000000000000" &&
        fromToken.address
      ) {
        const allowance = (await publicClient.readContract({
          address: fromToken.address as Address,
          abi: abis.erc20,
          functionName: "allowance",
          args: [address, approval],
        })) as bigint;

        const needed = BigInt(quote.action.fromAmount);
        if (allowance < needed) {
          await writeContractAsync({
            address: fromToken.address as Address,
            abi: abis.erc20,
            functionName: "approve",
            args: [approval, needed],
            chainId: fromChain,
          });
        }
      }

      const hash = await sendTransactionAsync({
        to: txReq.to,
        data: txReq.data,
        value: BigInt(txReq.value ?? "0"),
        chainId: txReq.chainId,
        gas: txReq.gasLimit ? BigInt(txReq.gasLimit) : undefined,
      });

      void pollStatus(hash, quote.action.fromChainId, quote.action.toChainId);
      return hash;
    },
    [address, publicClient, writeContractAsync, sendTransactionAsync, pollStatus]
  );

  useEffect(() => {
    if (isTxSuccess && txHash) setPolling(true);
  }, [isTxSuccess, txHash]);

  return {
    execute,
    status,
    isPending: isSending || isApproving || isApproveConfirming || isTxConfirming || polling,
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
