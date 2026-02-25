const normalizeUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const isUsableUrl = (value) => {
  try {
    const url = new URL(normalizeUrl(value));
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
};

const getApiBaseCandidates = () => {
  const nextEnv = String(process.env.NEXT_ENV || "").trim().toLowerCase();
  const devApiUrl = normalizeUrl(process.env.NEXT_PUBLIC_DEV_URL || "");
  const centralApiUrl = normalizeUrl(process.env.NEXT_PUBLIC_CENTRAL_URL || "");

  const primary = nextEnv === "development" ? devApiUrl : centralApiUrl;
  const fallback = nextEnv === "development" ? centralApiUrl : devApiUrl;

  return Array.from(new Set([primary, fallback].filter(isUsableUrl)));
};

const buildTargetUrl = (baseUrl, pathSegments = [], search = "") => {
  const cleanPath = Array.isArray(pathSegments)
    ? pathSegments.map((part) => encodeURIComponent(String(part || ""))).join("/")
    : "";
  const query = String(search || "");
  return `${normalizeUrl(baseUrl)}/${cleanPath}${query}`;
};

const normalizeProxyPathSegments = (segments = []) => {
  const path = Array.isArray(segments) ? segments.map((s) => String(s || "").trim()) : [];
  const key = path.join("/").toLowerCase();

  // Backward-compatible aliases used by some frontend clients.
  if (key === "auth/send-otp") return ["otp", "send-otp"];
  if (key === "auth/verify-otp") return ["otp", "verify-otp"];

  return path;
};

const readBody = async (request) => {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  return request.text();
};

const forwardRequest = async (request, targetUrl, bodyText) => {
  const incomingHeaders = new Headers(request.headers);
  incomingHeaders.delete("host");
  incomingHeaders.delete("connection");
  incomingHeaders.delete("content-length");

  return fetch(targetUrl, {
    method: request.method,
    headers: incomingHeaders,
    body: bodyText,
    redirect: "manual",
    cache: "no-store",
  });
};

const shouldTryNextBase = (responseOrError) => {
  if (!responseOrError) return true;
  if (responseOrError instanceof Error) return true;
  const status = Number(responseOrError.status || 0);
  return status >= 500;
};

const proxyHandler = async (request, { params }) => {
  const baseCandidates = getApiBaseCandidates();
  if (baseCandidates.length === 0) {
    return Response.json(
      { error: { message: "API base URL is not configured" } },
      { status: 500 }
    );
  }

  const pathSegments = normalizeProxyPathSegments(params?.path || []);
  const bodyText = await readBody(request);
  const attempts = [];
  let lastResponse = null;
  let lastError = null;

  for (const baseUrl of baseCandidates) {
    const targetUrl = buildTargetUrl(baseUrl, pathSegments, request.nextUrl.search);
    attempts.push(targetUrl);
    try {
      const response = await forwardRequest(request, targetUrl, bodyText);
      lastResponse = response;

      if (!shouldTryNextBase(response)) {
        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete("content-length");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Proxy request failed");
      if (!shouldTryNextBase(lastError)) break;
    }
  }

  if (lastResponse) {
    const responseHeaders = new Headers(lastResponse.headers);
    responseHeaders.delete("content-length");
    return new Response(lastResponse.body, {
      status: lastResponse.status,
      statusText: lastResponse.statusText,
      headers: responseHeaders,
    });
  }

  return Response.json(
    {
      error: {
        message: "API proxy failed",
        details: lastError?.message || "Unknown error",
        attempts,
      },
    },
    { status: 502 }
  );
};

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const PATCH = proxyHandler;
export const DELETE = proxyHandler;
export const OPTIONS = proxyHandler;
export const HEAD = proxyHandler;
