import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // The CSV validator permits 2 MB files; leave room for multipart overhead.
      bodySizeLimit: "3mb",
    },
  },
  // Type checking and linting are run explicitly in CI via `npm run typecheck`
  // and `npm run lint`; keep the defaults so `next build` also enforces them.
};

export default nextConfig;
