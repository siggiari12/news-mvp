import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.mbl.is' },
      { protocol: 'https', hostname: '**.ruv.is' },
      { protocol: 'https', hostname: '**.visir.is' },
      { protocol: 'https', hostname: '**.dv.is' },
      { protocol: 'https', hostname: '**.bbc.co.uk' },
      { protocol: 'https', hostname: '**.bbc.com' },
      { protocol: 'https', hostname: '**.cnn.com' },
      { protocol: 'https', hostname: '**.theguardian.com' },
      { protocol: 'https', hostname: '**.guim.co.uk' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'i.guim.co.uk' },
      { protocol: 'https', hostname: 'ichef.bbci.co.uk' },
      { protocol: 'https', hostname: 'cdn.cnn.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
