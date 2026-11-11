import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Proxy API calls to FastAPI so the browser talks to one origin.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/api-health", destination: `${backend}/health` },
    ];
  },
};

export default nextConfig;
