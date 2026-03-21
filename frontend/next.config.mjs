const rawBasePath = "";
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
const toOrigin = (value) => {
  try {
    return new URL(normalizeUrl(value)).origin;
  } catch {
    return "";
  }
};
const appBaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_LISTING_URL || "");
const authAppBaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL || "");
const directApiBaseUrl = "";
const devApiUrl = process.env.NEXT_PUBLIC_DEV_URL || "";
const centralApiUrl = process.env.NEXT_PUBLIC_CENTRAL_URL || "";
const DEFAULT_FALLBACK_API_URL = "https://central-api.seaneb.com/api/v1";
const nextEnv = String(process.env.NEXT_ENV || "").trim().toLowerCase();
const apiBaseUrl = normalizeUrl(nextEnv === "development" ? devApiUrl : centralApiUrl);
const fallbackApiBaseUrl = normalizeUrl(nextEnv === "development" ? centralApiUrl : devApiUrl);
const safeApiBaseUrl = isUsableUrl(directApiBaseUrl)
  ? normalizeUrl(directApiBaseUrl)
  : isUsableUrl(apiBaseUrl)
    ? apiBaseUrl
    : isUsableUrl(fallbackApiBaseUrl)
      ? fallbackApiBaseUrl
      : DEFAULT_FALLBACK_API_URL;
const apiHostname = isUsableUrl(safeApiBaseUrl) ? new URL(safeApiBaseUrl).hostname : "";
const isProduction = process.env.NODE_ENV === "production";
const connectSrc = [
  "'self'",
  toOrigin(safeApiBaseUrl),
  toOrigin(appBaseUrl),
  toOrigin(authAppBaseUrl),
].filter(Boolean).join(" ");
const imgSrc = [
  "'self'",
  "data:",
  "blob:",
  "https://flagcdn.com",
  "https://img.icons8.com",
  "https://maps.googleapis.com",
  "https://*.googleusercontent.com",
].join(" ");
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `connect-src ${connectSrc}`,
  `img-src ${imgSrc}`,
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
].join("; ");
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy", value: csp },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  basePath: normalizedBasePath,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2678400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "flagcdn.com",
      },
      ...(apiHostname
        ? [
            {
              protocol: "https",
              hostname: apiHostname,
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "img.icons8.com",
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
    ],
  },
  async redirects() {
    if (!appBaseUrl) return [];
    return [
      {
        source: "/home",
        destination: `${appBaseUrl}/home`,
        permanent: false,
      },
      {
        source: "/about",
        destination: `${appBaseUrl}/about`,
        permanent: false,
      },
      {
        source: "/contact",
        destination: `${appBaseUrl}/contact`,
        permanent: false,
      },
      {
        source: "/blogs",
        destination: `${appBaseUrl}/blogs`,
        permanent: false,
      },
      {
        source: "/solution",
        destination: `${appBaseUrl}/solution`,
        permanent: false,
      },
      {
        source: "/partner",
        destination: `${appBaseUrl}/partner`,
        permanent: false,
      },
      {
        source: "/faq",
        destination: `${appBaseUrl}/faq`,
        permanent: false,
      },
      {
        source: "/in/:path*",
        destination: `${appBaseUrl}/in/:path*`,
        permanent: false,
      },
    ];
  },
  async rewrites() {
    // API requests are handled by App Router proxy routes in src/app/api.
    // Keeping /api rewrites here bypasses those handlers and breaks fallback logic.
    return [];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  compiler: {
    removeConsole: isProduction ? { exclude: ["error", "warn"] } : false,
  },
  reactCompiler: true,
};

export default nextConfig;
