import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function BrokerDashboardPage() {
  const cookieStore = await cookies();
  const hasProfile = cookieStore.get("profile_completed")?.value === "true";
  const hasSession =
    Boolean(cookieStore.get("access_token")?.value) ||
    Boolean(cookieStore.get("session_start_time")?.value);

  if (!hasProfile && !hasSession) {
    redirect("/auth/login");
  }

  redirect("/auth/home?mode=business");
}
