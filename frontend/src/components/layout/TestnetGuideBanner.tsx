"use client";

import { useChainId } from "wagmi";
import { ExternalLink } from "lucide-react";
import { getChainDeploymentMeta } from "@/lib/contracts";
import { useI18n } from "@/lib/i18n";

export function TestnetGuideBanner() {
  const chainId = useChainId();
  const { locale } = useI18n();
  const meta = getChainDeploymentMeta(chainId);

  if (chainId !== 998 || meta.live) return null;

  const ja = locale === "ja";

  return (
    <div className="max-w-md mx-auto mb-4 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-200/90">
      <p className="font-medium text-amber-300 mb-1">
        {ja ? "HyperEVM Testnet — コントラクト未デプロイ" : "HyperEVM Testnet — contracts not deployed"}
      </p>
      <ol className="list-decimal list-inside space-y-1 text-amber-200/80">
        <li>
          {ja ? "CLI で一括:" : "CLI one-shot:"}{" "}
          <code className="text-zinc-300">./scripts/testnet-init.sh --deploy</code>
        </li>
        <li>
          {ja ? "Faucet で HYPE 取得:" : "Get HYPE via faucet:"}{" "}
          <a
            href="https://app.hyperliquid-testnet.xyz/drip"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:underline inline-flex items-center gap-0.5"
          >
            hyperliquid-testnet.xyz/drip <ExternalLink className="w-3 h-3" />
          </a>
        </li>
        <li>{ja ? "Big blocks 有効化 → PRIVATE_KEY で deploy-testnet.sh" : "Enable big blocks → run deploy-testnet.sh"}</li>
      </ol>
      <p className="mt-2 text-[10px] text-zinc-500">
        {ja ? "詳細:" : "Guide:"}{" "}
        <code className="text-zinc-400">docs/TESTNET_SETUP.ja.md</code>
      </p>
    </div>
  );
}
