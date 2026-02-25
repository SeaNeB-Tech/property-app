"use client";

export const redirectToOpenerOrSelf = (targetUrl) => {
  if (typeof window === "undefined") return;

  const safeUrl = String(targetUrl || "").trim();
  if (!safeUrl) return;

  const opener = window.opener;
  if (opener && !opener.closed) {
    try {
      opener.location.assign(safeUrl);
      opener.focus();
      window.close();
      return;
    } catch {
      // Some browsers can block cross-tab focus/close; fallback to same-tab redirect.
    }
  }

  window.location.assign(safeUrl);
};
