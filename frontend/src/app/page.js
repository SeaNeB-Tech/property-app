import { redirect } from "next/navigation";
import { getAuthAppUrl } from "@/lib/core/appUrls";

export default function Page() {
  redirect(getAuthAppUrl("/auth/login"));
}
