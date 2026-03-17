import { redirect } from "next/navigation";
import { getAuthAppUrl } from "@/lib/core/appUrls";

export default function LoginPage() {
  redirect(getAuthAppUrl("/auth/login"));
}

