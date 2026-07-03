import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    // Старый Vercel-деплой (web-sborka.vercel.app) живёт как вечный редиректор:
    // Vercel сам ставит env VERCEL=1, на self-hosted редирект не активируется
    if (!process.env.VERCEL) return [];
    return [
      {
        source: "/:path*",
        destination: "https://sbory.mirobase.ru/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
