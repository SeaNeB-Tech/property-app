import { Suspense } from "react";
import LoginContent from "./LoginContent";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
