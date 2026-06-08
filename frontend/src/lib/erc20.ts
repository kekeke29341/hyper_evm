import type { Address, PublicClient } from "viem";

type WriteContract = (args: {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}) => Promise<`0x${string}`>;

type Erc20Abi = readonly unknown[];

/** Approve only the exact amount needed — avoids excessive token allowances */
export async function ensureExactAllowance(
  publicClient: PublicClient,
  writeContract: WriteContract,
  token: Address,
  erc20Abi: Erc20Abi,
  owner: Address,
  spender: Address,
  amount: bigint
) {
  const allowance = (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;

  if (allowance < amount) {
    await writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount],
    });
  }
}
