import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  Coins,
  Droplets,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About | Hyper Pool",
  description:
    "USDCを預けるだけでProject XのHYPE/USDC流動性運用を自動化し、毎朝9時前後に収益を受け取るHyper Poolの紹介ページです。",
};

const payoutRows = [
  { time: "9時前後", label: "自動入金", amount: "+18.42 USDC", tone: "text-emerald-300" },
  { time: "9時前後", label: "自動入金", amount: "+21.05 USDC", tone: "text-emerald-300" },
  { time: "9時前後", label: "自動入金", amount: "+16.90 USDC", tone: "text-emerald-300" },
  { time: "9時前後", label: "自動リバランス実行", amount: "—", tone: "text-zinc-500" },
  { time: "9時前後", label: "自動入金", amount: "+23.18 USDC", tone: "text-emerald-300" },
];

const stats = [
  { value: "最低入金額", label: "なし", detail: "MetaMask等へ直接送金" },
  { value: "$15.1M", label: "HYPE/USDCプールの流動性", detail: "0.05%枠" },
  { value: "24時間", label: "稼働し続ける", detail: "オートリバランス" },
  { value: "毎朝9時前後", label: "収益の自動着金", detail: "JST" },
];

const operatingSteps = [
  {
    step: "STEP 1",
    title: "ウォレットを接続",
    body: "USDCを入金。最低入金額の縛りはなく、少額からでも始められます。",
  },
  {
    step: "STEP 2",
    title: "自動で流動性を配置",
    body: "Hyper PoolがProject XのHYPE/USDCプールへ流動性を配置。価格が動いてもレンジを追従させます。",
  },
  {
    step: "STEP 3",
    title: "毎朝ウォレットへ着金",
    body: "発生した収益は毎朝9時前後にMetaMaskなどのウォレットへ自動送金。手動クレームは不要です。",
  },
];

const strengths = [
  {
    mark: "R",
    title: "自動リバランス機能",
    body: "価格レンジのメンテナンスはHyper Poolにおまかせ。設定に応じて価格変動に追従し、資本効率を保ちます。",
  },
  {
    mark: "M",
    title: "最低入金額なし",
    body: "まとまった資金がなくても始められます。無理のない金額からテストして、感覚をつかんでから増やせます。",
  },
  {
    mark: "9",
    title: "毎朝9時前後、自動着金",
    body: "収益は毎日決まった時間にウォレットへ届く設計。朝のルーティンの中で、資産の実りを確認できます。",
  },
];

const startSteps = [
  {
    icon: Wallet,
    title: "ウォレットを接続する",
    body: "Hyper Poolのアプリを開き、MetaMaskなどHyperEVM対応ウォレットを接続します。",
  },
  {
    icon: Coins,
    title: "USDCを入金する",
    body: "金額は自由。最低入金額の制限はありません。",
  },
  {
    icon: RefreshCw,
    title: "自動運用がスタート",
    body: "Hyper PoolがProject XのHYPE/USDCプールへ配置し、リバランスも継続的に行います。",
  },
  {
    icon: Clock3,
    title: "毎朝、収益を確認",
    body: "9時前後に自動着金した収益をウォレットで確認するだけ。ダッシュボードでポジションと履歴もいつでも見られます。",
  },
];

const risks = [
  "APRは市場の取引量や価格変動によって日々変動します。掲載中の数値は現時点の参考値であり、将来の成果を保証するものではありません。",
  "HYPE/USDCのような値動きのある資産ペアでは、価格差によって評価額が目減りする「インパーマネントロス」が発生する可能性があります。",
  "Hyper PoolはProject Xのスマートコントラクトを利用しています。監査を受けたプロトコルであっても、技術的リスクを完全にゼロにすることはできません。",
  "ご自身のウォレット・秘密鍵の管理は自己責任となります。余裕資金の範囲でご利用ください。",
];

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[0.28em] text-cyan-300/80">
      {index} — {children}
    </p>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-hidden text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/75 backdrop-blur-xl safe-top">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/about" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-cyan-300 text-sm font-black text-zinc-950 shadow-[0_0_28px_rgba(0,245,255,0.28)]">
              H
            </span>
            <span>
              <span className="block text-sm font-black tracking-tight sm:text-base">Hyper Pool</span>
              <span className="hidden text-[10px] uppercase tracking-[0.22em] text-zinc-500 sm:block">
                Powered by Project X
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className="group inline-flex min-h-[40px] items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-bold text-cyan-100 transition hover:border-cyan-200 hover:bg-cyan-300/20"
          >
            アプリを開く
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative px-4 pb-12 pt-10 sm:pt-16 lg:pb-20">
          <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle_at_20%_10%,rgba(57,255,20,0.14),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(0,245,255,0.18),transparent_34%)]" />
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-200">
                <Sparkles className="h-3.5 w-3.5" />
                Powered by Project X / HyperEVM
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-[-0.05em] text-white sm:text-6xl lg:text-7xl">
                眠っている資産に、
                <span className="block bg-gradient-to-r from-emerald-200 via-cyan-200 to-white bg-clip-text text-transparent">
                  毎朝の実りを。
                </span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-300 sm:text-lg">
                Hyper Poolは、USDCを預けるだけでHYPE/USDCの流動性運用を自動で行うツール。
                リバランスもおまかせで、収益は毎朝9時前後にあなたのウォレットへ届きます。
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/"
                  className="gradient-btn inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-black shadow-[0_0_36px_rgba(0,245,255,0.24)]"
                >
                  Hyper Poolをはじめる
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#risk"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-bold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.07]"
                >
                  注意事項を見る
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-cyan-400/20 via-transparent to-emerald-400/20 blur-2xl" />
              <div className="card-glass overflow-hidden rounded-[2rem] p-4 sm:p-5">
                <div className="rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-500">Reference APR</p>
                      <p className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">110%〜139%</p>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                        現在のHYPE/USDCプール参考APR（Project Xより）
                      </p>
                    </div>
                    <div className="rounded-2xl bg-emerald-300/10 p-3 text-emerald-200">
                      <Droplets className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-white">受取履歴</p>
                      <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[10px] font-bold text-cyan-200">
                        毎朝 9時前後 JST
                      </span>
                    </div>
                    <div className="space-y-2">
                      {payoutRows.map((row, index) => (
                        <div
                          key={`${row.label}-${index}`}
                          className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 rounded-xl bg-zinc-900/75 px-3 py-2.5 text-sm"
                        >
                          <span className="font-mono text-xs text-zinc-500">{row.time}</span>
                          <span className="min-w-0 truncate text-zinc-200">{row.label}</span>
                          <span className={`font-mono text-xs font-bold ${row.tone}`}>{row.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-8 grid max-w-6xl grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={`${stat.value}-${stat.label}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-2xl font-black tracking-tight text-white">{stat.value}</p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">{stat.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{stat.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <SectionLabel index="01">Hyper Poolとは</SectionLabel>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">
                「預けるだけ」で運用がまわる仕組み
              </h2>
              <p className="mt-5 text-sm leading-8 text-zinc-300 sm:text-base">
                Hyper Poolは、HyperEVM上の分散型取引所「Project X」のHYPE/USDCプールに接続し、
                流動性提供を自動で管理するツールです。値動きに応じた価格レンジの調整（リバランス）もすべて内部で完結するので、
                チャートに張り付く必要はありません。預けたUSDCが働き、毎朝その実りだけを受け取る。
                それがHyper Poolの考え方です。
              </p>
            </div>
            <div className="grid gap-3">
              {operatingSteps.map((item) => (
                <div key={item.step} className="rounded-3xl border border-white/10 bg-zinc-900/60 p-5">
                  <p className="text-xs font-black tracking-[0.22em] text-emerald-300">{item.step}</p>
                  <h3 className="mt-3 text-xl font-black text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-6xl">
            <SectionLabel index="02">選ばれる理由</SectionLabel>
            <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">Hyper Poolの強み</h2>
              <p className="max-w-md text-sm leading-7 text-zinc-400">
                複雑なDeFi運用を、毎朝確認できるシンプルな体験へ。
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {strengths.map((item) => (
                <div
                  key={item.title}
                  className="group rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-cyan-300/[0.06]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 to-cyan-300 text-lg font-black text-zinc-950">
                    {item.mark}
                  </div>
                  <h3 className="mt-5 text-xl font-black text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-zinc-400">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/10 bg-zinc-900/50 p-5 sm:p-8">
            <SectionLabel index="03">使い方の流れ</SectionLabel>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">はじめかた</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {startSteps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="relative rounded-3xl border border-white/10 bg-zinc-950/65 p-5">
                    <span className="absolute right-5 top-5 font-mono text-xs text-zinc-600">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-base font-black text-white">{item.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-zinc-400">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="risk" className="px-4 py-12 sm:py-16">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[0.78fr_1.22fr]">
            <div>
              <SectionLabel index="04">知っておきたいこと</SectionLabel>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">
                ご利用にあたっての注意
              </h2>
            </div>
            <div className="rounded-[1.75rem] border border-amber-300/20 bg-amber-300/[0.06] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-amber-300/10 p-2 text-amber-200">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-amber-100">DeFi運用に共通するリスクについて</h3>
                  <div className="mt-4 space-y-3">
                    {risks.map((risk) => (
                      <p key={risk} className="text-sm leading-7 text-amber-50/75">
                        {risk}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:py-20">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-emerald-300/12 via-cyan-300/10 to-white/[0.03] p-6 text-center sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">
              HyperEVM上のProject X（HYPE/USDCプール）と連携
            </p>
            <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-black leading-tight tracking-[-0.04em] text-white sm:text-6xl">
              今日から、資産に
              <span className="block text-cyan-100">働いてもらいましょう。</span>
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-8 text-zinc-300 sm:text-base">
              まずは無理のない金額から。ウォレットを接続すれば、数分で自動運用がスタートします。
            </p>
            <Link
              href="/"
              className="gradient-btn mt-8 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-7 py-3 text-sm font-black"
            >
              Hyper Poolをはじめる
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mx-auto mt-6 max-w-2xl text-xs leading-6 text-zinc-500">
              本ページは情報提供を目的としており、投資成果を保証するものではありません。
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-4 py-8 text-center safe-bottom">
        <p className="mx-auto max-w-2xl text-xs leading-6 text-zinc-500">
          HyperEVM上のProject X（HYPE/USDCプール）と連携。DeFi運用には価格変動、インパーマネントロス、
          スマートコントラクト等のリスクがあります。
        </p>
      </footer>
    </div>
  );
}
