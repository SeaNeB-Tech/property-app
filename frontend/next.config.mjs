const rawBasePath = "";
const normalizedBasePath =
  rawBasePath && rawBasePath !== "/"
    ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";
const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const normalizeHost = (value) =>
  String(value || "")
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
const IPV4_HOSTNAME_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const isUsableUrl = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};
const isLoopbackOrIpUrl = (value) => {
  try {
    const hostname = normalizeHost(new URL(normalizeUrl(value)).hostname);
    if (!hostname) return false;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
    if (IPV4_HOSTNAME_PATTERN.test(hostname)) return true;
    return hostname.includes(":");
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
const useStaticListingRedirects = Boolean(appBaseUrl) && !isLoopbackOrIpUrl(appBaseUrl);
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
const isSandboxLikeEnv = !isProduction || nextEnv === "development";
const cashfreeSdkOrigins = ["https://sdk.cashfree.com"];
const cashfreeSandboxPaymentOrigins = ["https://sandbox.cashfree.com"];
const cashfreeProductionPaymentOrigins = ["https://api.cashfree.com"];
const cashfreePaymentOrigins = Array.from(
  new Set([...cashfreeSandboxPaymentOrigins, ...cashfreeProductionPaymentOrigins])
);
const cashfreeFrameOrigins = Array.from(
  new Set([...cashfreePaymentOrigins, ...cashfreeSdkOrigins])
);
const cashfreeFormActionOrigins = isSandboxLikeEnv
  ? cashfreePaymentOrigins
  : cashfreeProductionPaymentOrigins;
const connectSrc = [
  "'self'",
  toOrigin(safeApiBaseUrl),
  toOrigin(appBaseUrl),
  toOrigin(authAppBaseUrl),
  ...cashfreeFrameOrigins,
].filter(Boolean).join(" ");
const frameSrc = [
  "'self'",
  ...cashfreeFrameOrigins,
].join(" ");
const formActionSrc = [
  "'self'",
  ...cashfreeFormActionOrigins,
].join(" ");
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
  `form-action ${formActionSrc}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  `connect-src ${connectSrc}`,
  `frame-src ${frameSrc}`,
  `child-src ${frameSrc}`,
  `img-src ${imgSrc}`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${cashfreeSdkOrigins.join(" ")}`,
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
    if (!useStaticListingRedirects) return [];
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
