import { getJsonCookie, removeCookie, setJsonCookie } from "@/services/auth.service";

const AUTH_FLOW_COOKIE = "auth_flow_context";
const AUTH_TAB_NAME = "seaneb-auth-tab";
const AUTH_TAB_FLOW_PREFIX = `${AUTH_TAB_NAME}|flow=`;
const FLOW_SOURCE_KEY = "source";
const FLOW_RETURN_TO_KEY = "returnTo";

const normalizeSource = (value) => String(value || "").trim().toLowerCase();
const normalizeReturnTo = (value) => String(value || "").trim();

const normalizeFlowContext = (value = {}) => {
  const source = normalizeSource(value?.[FLOW_SOURCE_KEY]);
  const returnTo = normalizeReturnTo(value?.[FLOW_RETURN_TO_KEY]);
  return { source, returnTo };
};

export const getAuthFlowContext = () => {
  try {
    return normalizeFlowContext(getJsonCookie(AUTH_FLOW_COOKIE) || {});
  } catch {
    return { source: "", returnTo: "" };
  }
};

export const setAuthFlowContext = (value = {}, options = {}) => {
  const context = normalizeFlowContext(value);
  setJsonCookie(AUTH_FLOW_COOKIE, context, {
    maxAge: 10 * 60,
    path: "/",
    ...options,
  });
  return context;
};

export const clearAuthFlowContext = () => {
  removeCookie(AUTH_FLOW_COOKIE, { path: "/" });
};

export const ingestAuthFlowContextFromUrl = () => {
  if (typeof window === "undefined") return getAuthFlowContext();

  const params = new URLSearchParams(window.location.search);
  const source = normalizeSource(params.get(FLOW_SOURCE_KEY) || "");
  const returnTo = normalizeReturnTo(params.get(FLOW_RETURN_TO_KEY) || "");

  if (!source && !returnTo) return getAuthFlowContext();

  return setAuthFlowContext({ source, returnTo });
};

export const ingestAuthFlowContextFromWindowName = () => {
  if (typeof window === "undefined") return getAuthFlowContext();
  const rawName = String(window.name || "").trim();
  if (!rawName.startsWith(AUTH_TAB_FLOW_PREFIX)) return getAuthFlowContext();

  const encoded = rawName.slice(AUTH_TAB_FLOW_PREFIX.length);
  try {
    const decoded = decodeURIComponent(escape(window.atob(encoded)));
    const payload = JSON.parse(decoded);
    const context = setAuthFlowContext(payload || {});
    window.name = AUTH_TAB_NAME;
    return context;
  } catch {
    window.name = AUTH_TAB_NAME;
    return getAuthFlowContext();
  }
};

export const stripAuthFlowParamsFromAddressBar = () => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const hadSource = url.searchParams.has(FLOW_SOURCE_KEY);
  const hadReturnTo = url.searchParams.has(FLOW_RETURN_TO_KEY);

  if (!hadSource && !hadReturnTo) return;

  url.searchParams.delete(FLOW_SOURCE_KEY);
  url.searchParams.delete(FLOW_RETURN_TO_KEY);

  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextPath || url.pathname);
};
