"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth/AuthContext";

export default function AuthProviderClient({ children }) {
  const pathname = usePathname();
  const path = String(pathname || "").toLowerCase();

  // Auth pages manage their own bootstrap/session flow.
  // Avoid global provider probes like /profile/me on these routes.
  if (path.startsWith("/auth/")) {
    return children;
  }

  return <AuthProvider>{children}</AuthProvider>;
}
