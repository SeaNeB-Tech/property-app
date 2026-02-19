import { redirect } from "next/navigation";

const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const normalizeListingAppUrl = (value) => {
  const normalized = normalizeUrl(value);
  if (!normalized) return normalized;
  try {
    const parsed = new URL(normalized);
    if (parsed.port === "8877" || parsed.port === "1002") {
      parsed.port = "1001";
      return normalizeUrl(parsed.toString());
    }
  } catch {
    return normalized;
  }
  return normalized;
};

const LISTING_APP_URL = normalizeListingAppUrl(
  process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://159.65.154.221:1001"
);

export default function BrokerDashboardPage() {
  redirect(`${LISTING_APP_URL}/dashboard/broker`);
}
