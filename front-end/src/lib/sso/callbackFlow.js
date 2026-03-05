export const consumeBridgeTokenOnce = ({ token, hasHandledRef }) => {
  const safeToken = String(token || "").trim();
  if (!safeToken) return "";
  if (!hasHandledRef || hasHandledRef.current) return "";
  hasHandledRef.current = true;
  return safeToken;
};

export const removeBridgeTokenFromSearch = (search = "") => {
  const params = new URLSearchParams(String(search || ""));
  params.delete("bridge_token");
  params.delete("bridgeToken");
  const next = params.toString();
  return next ? `?${next}` : "";
};

export const buildNon401FailurePath = (pathname = "", fallback = "/auth/login") => {
  const nextPath = String(pathname || "").trim();
  return nextPath || String(fallback || "/auth/login");
};

