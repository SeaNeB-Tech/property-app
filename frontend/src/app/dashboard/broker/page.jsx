import { BrokerDashboardWorkspace } from "@/modules/broker-dashboard/components/BrokerDashboardWorkspace";

export default function BrokerDashboardPage() {
  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <BrokerDashboardWorkspace />
      </main>
    </div>
  );
}
