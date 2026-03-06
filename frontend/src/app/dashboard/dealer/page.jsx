import { redirect } from "next/navigation";
import { getListingAppUrl } from "@/lib/core/appUrls";

export default function DealerDashboardPage() {
  redirect(getListingAppUrl("/dashboard/broker"));
}
