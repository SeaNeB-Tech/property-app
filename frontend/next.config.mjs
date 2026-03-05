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
const toOrigin = (value) => {
  try {
    return new URL(normalizeUrl(value)).origin;
  } catch {
    return "";
  }
};
const appBaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL || "");
const authAppBaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_AUTH_APP_URL || "");
const directApiBaseUrl =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "";
const devApiUrl = process.env.NEXT_PUBLIC_DEV_URL || "";
const centralApiUrl = process.env.NEXT_PUBLIC_CENTRAL_URL || process.env.NEXT_PUBLIC_CENTRAL_API_URL || "";
const nextEnv = String(process.env.NEXT_ENV || "").trim().toLowerCase();
const apiBaseUrl = normalizeUrl(nextEnv === "development" ? devApiUrl : centralApiUrl);
const fallbackApiBaseUrl = normalizeUrl(nextEnv === "development" ? centralApiUrl : devApiUrl);
const safeApiBaseUrl = isUsableUrl(directApiBaseUrl)
  ? normalizeUrl(directApiBaseUrl)
  : isUsableUrl(apiBaseUrl)
    ? apiBaseUrl
    : fallbackApiBaseUrl;
const apiHostname = isUsableUrl(safeApiBaseUrl) ? new URL(safeApiBaseUrl).hostname : "";
const isProduction = process.env.NODE_ENV === "production";
const connectSrc = [
  "'self'",
  toOrigin(safeApiBaseUrl),
  toOrigin(appBaseUrl),
  toOrigin(authAppBaseUrl),
].filter(Boolean).join(" ");
const imgSrc = ["'self'", "data:", "blob:", "https://flagcdn.com", "https://img.icons8.com"].join(" ");
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
  env: {
    NEXT_PUBLIC_AUTH_APP_URL: process.env.NEXT_PUBLIC_AUTH_APP_URL || authAppBaseUrl,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || appBaseUrl,
  },
  images: {
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
    if (!safeApiBaseUrl) return [];
    return [
      {
        source: "/api/auth/send-otp",
        destination: `${safeApiBaseUrl}/otp/send-otp`,
      },
      {
        source: "/api/auth/verify-otp",
        destination: `${safeApiBaseUrl}/otp/verify-otp`,
      },
      {
        source: "/api/:path*",
        destination: `${safeApiBaseUrl}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  reactCompiler: true,
};

export default nextConfig;
