import { Suspense } from "react";
import SsoCallbackContent from "./SsoCallbackContent";

export const dynamic = "force-dynamic";

export default function SsoCallback() {
  return (
    <Suspense fallback={null}>
      <SsoCallbackContent />
    </Suspense>
  );
}
