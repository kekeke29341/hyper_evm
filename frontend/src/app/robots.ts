import type { MetadataRoute } from "next";

// 被リンク調査と AI 学習のクローラーだけ断る。検索エンジンと SNS のプレビュー bot（流入源）は許可のまま。
// Vercel Hobby はチーム共有の枠を超えると予告なく止まる。このサイトは 1 ページ表示で約 40 リクエスト
// （JS チャンク＋RSC プリフェッチ＋/api/pool-apr）なので、JS を実行するクローラーの影響がチームで一番大きい。
// robots.txt を無視する bot もいるので、本命は Vercel Firewall の同名ルール（ここは礼儀正しい bot 向けの補助）。
const DISALLOWED_CRAWLERS = [
  "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "DataForSeoBot", "serpstatbot", "Barkrowler",
  "GPTBot", "ClaudeBot", "anthropic-ai", "CCBot", "Bytespider", "meta-externalagent", "cohere-ai",
  "Diffbot", "ImagesiftBot", "Timpibot", "omgili", "Google-Extended", "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: DISALLOWED_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/"] },
    ],
  };
}
