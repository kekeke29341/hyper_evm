/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/liquidity", destination: "/position", permanent: true }];
  },
  transpilePackages: [
    "@wagmi/connectors",
    "@wagmi/core",
    "@metamask/connect-evm",
    "@metamask/connect-multichain",
    "@walletconnect/ethereum-provider",
  ],
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
