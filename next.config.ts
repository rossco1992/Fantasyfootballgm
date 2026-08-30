import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // CSV batches are capped at 4 MB; leave room for multipart overhead.
      bodySizeLimit: "5mb",
    },
  },
  // Type checking and linting are run explicitly in CI via `npm run typecheck`
  // and `npm run lint`; keep the defaults so `next build` also enforces them.
};

export default nextConfig;
