/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@vladmandic/face-api"],
  webpack: (config, { isServer }) => {
    config.module.exprContextCritical = false;
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        encoding: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
