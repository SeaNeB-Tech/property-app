"use client";

import { getAuthFlowContext } from "@/lib/auth/flowContext";

const LOGIN_SUCCESS_MESSAGE_TYPE = "SEANEB_LOGIN_SUCCESS";
const LOGOUT_MESSAGE_TYPE = "SEANEB_LOGOUT";
const MESSAGE_VERSION = 1;

const getAllowedOrigins = () => {
  const appUrl = String(process.env.NEXT_PUBLIC_LISTING_URL || "").trim();
  const merged = appUrl ? [appUrl] : [];

  return merged
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
};

const resolveTargetOrigin = (returnTo = "") => {
  const allowed = getAllowedOrigins();
  const target = String(returnTo || "").trim();

  if (target) {
    try {
      if (target.startsWith("/")) {
        return allowed[0] || "";
      }
      const parsed = new URL(target);
      if (allowed.length === 0 || allowed.includes(parsed.origin)) {
        return parsed.origin;
      }
    } catch {
      // ignore invalid returnTo
    }
  }

  return allowed[0] || "";
};

const postToOpener = (payload, returnTo = "") => {
  if (typeof window === "undefined") return false;
  if (!window.opener || window.opener.closed) return false;
  const targetOrigin = resolveTargetOrigin(returnTo);
  if (!targetOrigin) return false;

  try {
    window.opener.postMessage(payload, targetOrigin);
    return true;
  } catch {
    return false;
  }
};

export const postLoginSuccessToOpener = ({ accessToken = "", csrfToken = "", returnTo = "" } = {}) => {
  const flow = getAuthFlowContext();
  const target = returnTo || flow?.returnTo || "";
  return postToOpener(
    {
      type: LOGIN_SUCCESS_MESSAGE_TYPE,
      accessToken: String(accessToken || "").trim(),
      csrfToken: String(csrfToken || "").trim(),
      at: Date.now(),
      v: MESSAGE_VERSION,
    },
    target
  );
};

export const postLogoutToOpener = ({ returnTo = "" } = {}) => {
  const flow = getAuthFlowContext();
  const target = returnTo || flow?.returnTo || "";
  return postToOpener(
    {
      type: LOGOUT_MESSAGE_TYPE,
      at: Date.now(),
      v: MESSAGE_VERSION,
    },
    target
  );
};

