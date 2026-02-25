import { redirect } from "next/navigation";
import { getAuthAppUrl } from "@/lib/appUrls";

export default function LoginPage() {
  redirect(getAuthAppUrl("/auth/login"));
}

