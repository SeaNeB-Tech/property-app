import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const portsConfigPath = path.resolve(__dirname, "..", "deployment-ports.json");

const readPortsConfig = () => {
  try {
    const raw = fs.readFileSync(portsConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      host: String(parsed?.host || "159.65.154.221").trim(),
      listingPort: String(parsed?.listingPort || "1001").trim(),
      appPort: String(parsed?.appPort || "1002").trim(),
    };
  } catch {
    return { host: "159.65.154.221", listingPort: "1001", appPort: "1002" };
  }
};

const portsConfig = readPortsConfig();
const defaultListingUrl = `http://${portsConfig.host}:${portsConfig.listingPort}`;
const defaultAuthUrl = `http://${portsConfig.host}:${portsConfig.appPort}`;

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const normalizedBasePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";
const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const listingAppBaseUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_LISTING_APP_URL || defaultListingUrl
);
const devApiUrl =
  process.env.API_DEV_URL ||
  process.env.NEXT_PUBLIC_API_DEV_URL ||
  "https://dev.seaneb.com/api/v1";
const centralApiUrl =
  process.env.API_CENTRAL_URL ||
  process.env.NEXT_PUBLIC_API_CENTRAL_URL ||
  "https://central-api.seaneb.com/api/v1";
const envSelectedApiUrl = process.env.NODE_ENV === "development" ? devApiUrl : centralApiUrl;
const apiBaseUrl = (
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  envSelectedApiUrl
).replace(/\/+$/, "");
const apiHostname = new URL(apiBaseUrl).hostname;

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
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
  reactCompiler: true,
};

export default nextConfig;
