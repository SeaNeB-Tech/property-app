"use client";

import { AuthProvider } from "@/lib/authCompat";

export default function AuthProviderClient({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}