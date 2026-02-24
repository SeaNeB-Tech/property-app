import { redirect } from "next/navigation";
import { getListingAppUrl } from "@/lib/appUrls";

export default function BrokerDashboardPage() {
  redirect(getListingAppUrl("/dashboard/broker"));
}
