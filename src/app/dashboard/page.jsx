import { redirect } from "next/navigation";
import { getListingAppUrl } from "@/lib/appUrls";

export default function DashboardPage() {
  redirect(getListingAppUrl("/dashboard"));
}
