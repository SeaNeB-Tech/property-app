"use client"

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import BrandLogo from "./BrandLogo";

export default function AppHeader({ showLogout = true }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      // Clear cookies/tokens
      document.cookie = "access_token=; max-age=0; path=/;";
      document.cookie = "refresh_token=; max-age=0; path=/;";
      document.cookie = "mobile_verified=; max-age=0; path=/;";
      document.cookie = "otp_mobile=; max-age=0; path=/;";
      document.cookie = "otp_cc=; max-age=0; path=/;";
      
      router.push("/");
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white border-b border-gray-200 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
        {/* Logo & Branding */}
        <Link href="/" className="hover:opacity-85 transition-opacity group">
          <div className="group-hover:scale-110 transition-transform">
            <BrandLogo
              size={44}
              titleClass="text-xl font-bold text-gray-900"
              subtitleClass="text-xs text-gray-600 font-medium"
              textWrapperClass="hidden sm:block"
            />
          </div>
        </Link>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          {showLogout && (
            <button
              onClick={handleLogout}
              disabled={isLoading}
              className="px-6 py-2.5 text-sm font-semibold text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
            >
              {isLoading ? "Logging out..." : "Logout"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
