import { Suspense } from "react";
import BusinessRegContent from "./BusinessRegContent";

export const dynamic = "force-dynamic";

export default function BusinessRegAliasPage() {
  return (
    <Suspense fallback={null}>
      <BusinessRegContent />
    </Suspense>
  );
}
