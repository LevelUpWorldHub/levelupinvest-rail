import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// The web app imports the read-only rail from ../src (same repo). Point the
// bundler root at the repo root so those files are traced and bundled.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const config: NextConfig = {
  turbopack: { root: repoRoot },
  // The rail uses NodeNext-style "./x.js" imports of .ts files; map them (webpack build).
  webpack(cfg) {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
export default config;
