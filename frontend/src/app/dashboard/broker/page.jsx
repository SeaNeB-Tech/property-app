 "use client";

import BrokerDashboardShell from "@/components/dashboard/BrokerDashboardShell";
import RequireAuth from "@/components/auth/RequireAuth";

export default function BrokerDashboardPage() {
  return (
    <RequireAuth>
      <BrokerDashboardShell />
    </RequireAuth>
  );
}
