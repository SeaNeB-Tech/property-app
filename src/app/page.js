import { redirect } from "next/navigation";
import { getAuthAppUrl } from "@/lib/appUrls";

export default function Page() {
  redirect(getAuthAppUrl("/auth/login"));
}
