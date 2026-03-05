import { redirect } from "next/navigation";
import { getListingAppUrl } from "@/lib/core/appUrls";

export default function DashboardPage() {
  redirect(getListingAppUrl("/dashboard"));
}
