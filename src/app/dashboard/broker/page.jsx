import { redirect } from "next/navigation";

const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");
const LISTING_APP_URL = normalizeUrl(
  process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://localhost:8877"
);

export default function BrokerDashboardPage() {
  redirect(`${LISTING_APP_URL}/dashboard/broker`);
}
