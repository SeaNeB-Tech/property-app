import { redirect } from "next/navigation";

const LISTING_APP_URL = (process.env.NEXT_PUBLIC_LISTING_APP_URL || "http://localhost:8877").replace(
  /\/+$/,
  ""
);

export default function DashboardPage() {
  redirect(`${LISTING_APP_URL}/dashboard`);
}

