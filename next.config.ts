import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
// Checkout script origin (overridable for the provider test suite's local stand-in).
const checkoutOrigin = process.env.RAZORPAY_CHECKOUT_SRC ? new URL(process.env.RAZORPAY_CHECKOUT_SRC).origin : "https://checkout.razorpay.com";

// Third parties: Razorpay Checkout (script on the payment screen) and the Google Maps embed (iframe). Inline scripts are Next's hydration payload (no nonce, so
// pages stay statically optimisable); 'unsafe-eval' is only needed by React Refresh in dev.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${checkoutOrigin}${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com${checkoutOrigin === "https://checkout.razorpay.com" ? "" : ` ${checkoutOrigin}`}${isDev ? " ws:" : ""}`,
  // Google Maps Embed on listing pages (NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY).
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://www.google.com",
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
    // Our own uploads (ids are opaque, no query strings)…
    localPatterns: [{ pathname: "/media/**", search: "" }],
    // …and artwork for listings imported from District, BookMyShow and KheloMore (scripts/crawl).
    remotePatterns: [
      { protocol: "https", hostname: "cdn.district.in" },
      { protocol: "https", hostname: "assets-in.bmscdn.com" },
      { protocol: "https", hostname: "**.khelomore.com" },
    ],
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
