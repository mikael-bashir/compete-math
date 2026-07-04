import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Archives was renamed to Practice. Keep old links/bookmarks working.
    return [
      { source: "/archives", destination: "/practice", permanent: true },
      {
        source: "/archives/problems/:id",
        destination: "/practice/problems/:id",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
