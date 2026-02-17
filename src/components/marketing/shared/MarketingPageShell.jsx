import MainNavbar from "@/components/ui/MainNavbar";

/**
 * Top-level shell used by all marketing pages.
 * Keeps navbar + consistent page container spacing.
 */
export default function MarketingPageShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <MainNavbar />
      <main>{children}</main>
    </div>
  );
}
