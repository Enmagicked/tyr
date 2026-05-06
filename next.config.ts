import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // pdf-parse uses Node.js fs — tell Next.js not to bundle it
  serverExternalPackages: ["pdf-parse"],
  // Disambiguate workspace root — there's a stray package-lock.json in the
  // user's home directory that Next would otherwise pick as root.
  turbopack: {
    root: here,
  },
};

export default nextConfig;
