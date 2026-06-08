export type LifiToken = {
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
  name?: string;
};

export type LifiQuote = {
  id: string;
  tool: string;
  toolDetails?: { key: string; name: string; logoURI?: string };
  action: {
    fromToken: LifiToken;
    toToken: LifiToken;
    fromAmount: string;
    fromChainId: number;
    toChainId: number;
  };
  estimate: {
    toAmount: string;
    toAmountMin: string;
    approvalAddress?: string;
    gasCosts?: Array<{ amountUSD?: string; estimate?: string }>;
    feeCosts?: Array<{ name: string; amountUSD?: string; included?: boolean }>;
    executionDuration?: number;
  };
  transactionRequest?: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    from?: string;
    chainId: number;
    gasLimit?: string;
  };
  transactionId?: string;
};

export type LifiStatus = {
  status: string;
  substatus?: string;
  sending?: { txHash?: string; chainId?: number };
  receiving?: { txHash?: string; chainId?: number };
};
