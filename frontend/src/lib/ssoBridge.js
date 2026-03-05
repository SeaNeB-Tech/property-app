import { exchangeSsoBridgeToken } from "@/services/sso.services";

export const readBridgeTokenFromResponse = (payload = {}) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.payload,
    payload?.session,
    payload?.tokens,
    payload?.token,
    payload?.data?.token,
    payload?.data?.tokens,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const token = String(
      candidate?.bridge_token ||
        candidate?.bridgeToken ||
        candidate?.sso_bridge_token ||
        candidate?.ssoBridgeToken ||
        ""
    ).trim();
    if (token) return token;
  }

  return "";
};

export const readBridgeTokenFromLocation = (search = "") => {
  const sourceSearch =
    typeof search === "string"
      ? search
      : typeof window !== "undefined"
        ? window.location.search
        : "";
  const params = new URLSearchParams(sourceSearch || "");
  const fromQuery = String(params.get("bridge_token") || params.get("bridgeToken") || "").trim();
  if (fromQuery) return fromQuery;
  if (typeof window === "undefined") return "";
  const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  return String(hashParams.get("bridge_token") || hashParams.get("bridgeToken") || "").trim();
};

export const exchangeBridgeToken = async (bridgeToken) => {
  return exchangeSsoBridgeToken(bridgeToken);
};
