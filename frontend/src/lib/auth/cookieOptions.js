const readProto = (request) => {
  const forwardedProto = String(request?.headers?.get?.("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) return forwardedProto;
  const nextProto = String(request?.nextUrl?.protocol || "").trim().toLowerCase();
  if (nextProto) return nextProto.replace(":", "");
  return "http";
};

export const getCookieOptions = (request) => {
  const proto = readProto(request);
  const isHttp = proto.startsWith("http") && !proto.startsWith("https");
  return {
    sameSite: isHttp ? "Lax" : "None",
    secure: !isHttp,
  };
};

export const sanitizeCookieDomain = (domain) => {
  const raw = String(domain || "").trim();
  if (!raw) return "";
  return raw.replace(/:\d+$/, "");
};
