"use client";

import RequireAuth from "@/components/auth/RequireAuth";
import { BrokerDashboardWorkspace } from "@/modules/broker-dashboard/components/BrokerDashboardWorkspace";

export default function DealerDashboardPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-[radial-gradient(900px_500px_at_0%_0%,rgba(47,91,234,0.12),transparent_55%),radial-gradient(900px_500px_at_100%_0%,rgba(18,183,106,0.09),transparent_50%),linear-gradient(180deg,#f5f7fb_0%,#eef2f7_100%)]">
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <BrokerDashboardWorkspace />
        </main>
      </div>
    </RequireAuth>
  );
}
