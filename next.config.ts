import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  turbopack: {
    root: /* turbopackIgnore: true */ process.cwd(),
  },
};

export default nextConfig;
