import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {},
  allowedDevOrigins: ["tough-paws-create.loca.lt", "*.loca.lt", "localhost:3000", "localhost:3001"],
  async headers() {
    // Disable CSP in development for easier debugging
    if (process.env.NODE_ENV === "development") {
      return [
        {
          source: "/:path*",
          headers: [
            {
              key: "Content-Security-Policy",
              value: "default-src *; script-src 'self' 'unsafe-inline' 'unsafe-eval' *; style-src 'self' 'unsafe-inline' *; img-src * data: blob:; font-src 'self' data: *; connect-src * blob: data:; frame-ancestors 'none';",
            },
          ],
        },
      ];
    }
    
    // Production CSP (strict)
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://fxjxcijjdwgzydrbpnza.supabase.co wss://fxjxcijjdwgzydrbpnza.supabase.co; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
