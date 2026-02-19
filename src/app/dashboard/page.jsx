import { redirect } from "next/navigation";

const LISTING_APP_URL = (process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://localhost:1001").replace(
  /\/+$/,
  ""
);

export default function DashboardPage() {
  redirect(`${LISTING_APP_URL}/dashboard`);
}
