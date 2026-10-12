import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The only third party is Razorpay Checkout (loaded on the payment screen). Inline scripts are Next's hydration payload (no nonce, so
// pages stay statically optimisable); 'unsafe-eval' is only needed by React Refresh in dev.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com${isDev ? " ws:" : ""}`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: 'camera=(self), geolocation=(self), microphone=(), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com"), usb=()' },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Pages read live inventory from the database on every request.
  cacheComponents: false,
  partialPrefetching: false,
  poweredByHeader: false,
  // Native driver; loaded by Node at runtime rather than bundled.
  serverExternalPackages: ["better-sqlite3"],
  images: {
    // Only our own uploads are optimised (ids are opaque, no query strings).
    localPatterns: [{ pathname: "/media/**", search: "" }],
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [
      // Private documents set their own headers (a page CSP would block the browser's PDF viewer).
      { source: "/((?!api/documents/).*)", headers: securityHeaders },
      { source: "/api/documents/:id", headers: securityHeaders.filter((h) => h.key !== "Content-Security-Policy") },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
