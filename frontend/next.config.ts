import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this directory. Without it, Next walks up and
    // finds stray package-lock.json files (in the repo parent and the home
    // dir) and guesses the wrong root, which destabilises Turbopack's dev
    // module resolution and can make valid routes 404 intermittently.
    root: path.join(__dirname),
  },
};

export default nextConfig;
