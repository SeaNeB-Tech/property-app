import { Suspense } from "react";
import LoginContent from "./LoginContent";

export const dynamic = "force-dynamic";

const AuthHoldFallback = () => (
  <div
    className="flex min-h-screen items-center justify-center bg-white"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 text-center shadow-sm">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
      <p className="text-sm text-slate-500">Preparing session...</p>
    </div>
  </div>
);

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const hasReturnTo = Boolean(params?.returnTo);
  return (
    <Suspense fallback={<AuthHoldFallback />}>
      <LoginContent initialHold={hasReturnTo} />
    </Suspense>
  );
}
