import type { NextConfig } from "next";

// Security headers on every route. Only frame-ancestors in the CSP: no page may be framed (clickjacking).
// A full script CSP is left out on purpose, since it would need nonces for Next's inline scripts.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
