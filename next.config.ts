import type { NextConfig } from "next";

// Where the browser may load things from. Supabase serves sign-in, the database API and storage (catalogue pictures,
// signed links to uploads); the background remover downloads its model from Hugging Face and its engine from jsDelivr.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Next.js adds small inline scripts; the background remover needs WebAssembly and its loader from jsDelivr.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.jsdelivr.net${dev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // nobody can show the shop or the admin pages inside a frame on another site (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // A self-contained server build (server.js plus only the files it needs), for the Docker image and any Kenyan host.
  output: "standalone",
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // garment photos and the logo change only with a new release, and keep their names; cache them for a day
      { source: "/garments/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/brand/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
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
