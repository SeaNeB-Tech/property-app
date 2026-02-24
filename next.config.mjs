const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const normalizedBasePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";
const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const isUsableUrl = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};
const defaultListingUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://159.65.154.221:1001"
);
const defaultAuthUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://159.65.154.221:1002"
);
const listingAppBaseUrl = defaultListingUrl;
const devApiUrl = process.env.NEXT_PUBLIC_DEV_URL || "";
const centralApiUrl = process.env.NEXT_PUBLIC_CENTRAL_URL || "";
const localApiFallbackUrl = "https://dev.seaneb.com/api/v1";
const nextEnv = String(process.env.NEXT_ENV || "").trim().toLowerCase();
const primaryApiUrl = nextEnv === "development" ? devApiUrl : centralApiUrl;
const secondaryApiUrl = nextEnv === "development" ? centralApiUrl : devApiUrl;
const envSelectedApiUrl = isUsableUrl(primaryApiUrl) ? primaryApiUrl : secondaryApiUrl;
const apiBaseUrl = (
  process.env.API_URL ||
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  envSelectedApiUrl
).replace(/\/+$/, "");
const safeApiBaseUrl = isUsableUrl(apiBaseUrl)
  ? apiBaseUrl
  : normalizeUrl(isUsableUrl(secondaryApiUrl) ? secondaryApiUrl : localApiFallbackUrl);
const apiHostname = new URL(safeApiBaseUrl).hostname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: normalizedBasePath,
  env: {
    NEXT_PUBLIC_AUTH_APP_URL: process.env.NEXT_PUBLIC_AUTH_APP_URL || defaultAuthUrl,
    NEXT_PUBLIC_LISTING_APP_URL: process.env.NEXT_PUBLIC_LISTING_APP_URL || defaultListingUrl,
  },
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
        destination: `${safeApiBaseUrl}/:path*`,
      },
    ];
  },
  reactCompiler: true,
};

export default nextConfig;
