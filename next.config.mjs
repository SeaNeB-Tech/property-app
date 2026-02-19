const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const normalizedBasePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";
const listingAppBaseUrl = (process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://159.65.154.221:1002").replace(
  /\/+$/,
  ""
);
const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://dev.seaneb.com/api/v1"
).replace(/\/+$/, "");
const apiHostname = new URL(apiBaseUrl).hostname;

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
        hostname: apiHostname,
      },
      {
        protocol: "https",
        hostname: "img.icons8.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/home",
        destination: `${listingAppBaseUrl}/home`,
        permanent: false,
      },
      {
        source: "/about",
        destination: `${listingAppBaseUrl}/about`,
        permanent: false,
      },
      {
        source: "/contact",
        destination: `${listingAppBaseUrl}/contact`,
        permanent: false,
      },
      {
        source: "/blogs",
        destination: `${listingAppBaseUrl}/blogs`,
        permanent: false,
      },
      {
        source: "/solution",
        destination: `${listingAppBaseUrl}/solution`,
        permanent: false,
      },
      {
        source: "/partner",
        destination: `${listingAppBaseUrl}/partner`,
        permanent: false,
      },
      {
        source: "/in/:path*",
        destination: `${listingAppBaseUrl}/in/:path*`,
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
  reactCompiler: true,
};

export default nextConfig;
