const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const normalizedBasePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: normalizedBasePath,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flagcdn.com",
      },
      {
        protocol: "https",
        hostname: "dev.seaneb.com",
      },
      {
        protocol: "https",
        hostname: "api.seanebjobs.com",
      },
    ],
  },
  reactCompiler: true,
};

export default nextConfig;
