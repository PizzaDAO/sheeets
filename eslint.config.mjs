import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Event flyers/avatars are hot-linked from arbitrary third-party hosts
      // (Luma, Google, Twitter CDNs, ...), so next/image's remotePatterns
      // allow-list and optimizer don't fit. Plain <img> is intentional.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gitignored local one-off script (may exist in some checkouts).
    "scripts/migrate-itinerary-ids.ts",
  ]),
]);

export default eslintConfig;
