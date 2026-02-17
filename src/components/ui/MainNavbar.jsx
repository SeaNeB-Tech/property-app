"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import BrandLogo from "./BrandLogo";
import navbarLinks from "@/data/navbarLinks.json";
import { getCookie } from "@/services/cookie";

function NavbarItem({ item }) {
  const isExternal = item.href.startsWith("http");
  const isAnchor = item.href.startsWith("#");
  const useAnchorTag = isExternal || item.download || isAnchor;

  if (useAnchorTag) {
    return (
      <a
        href={item.href}
        download={item.download ? true : undefined}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="text-sm font-medium hover:text-white transition"
      >
        {item.name}
      </a>
    );
  }

  return (
    <Link href={item.href} className="text-sm font-medium hover:text-white transition">
      {item.name}
    </Link>
  );
}

export default function MainNavbar() {
  const isAuthenticated = useSyncExternalStore(
    () => () => {},
    () =>
      getCookie("profile_completed") === "true" ||
      Boolean(getCookie("access_token")) ||
      Boolean(getCookie("session_start_time")),
    () => false
  );

  return (
    <header className="relative z-50 bg-black border-b border-gray-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        
        {/* ================= LEFT: LOGO + LOCATION ================= */}
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link
            href="/home"
            className="hover:opacity-90 transition"
          >
            <BrandLogo
              size={48}
              titleClass="text-white text-lg font-bold"
              subtitleClass="text-gray-400 text-xs"
              textWrapperClass="hidden md:block"
              compact
            />
          </Link>

          {/* Location Pill */}
          <div className="hidden sm:flex items-center ml-4">
            <span className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold shadow hover:bg-red-700 transition">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"
                  fill="#fff"
                />
              </svg>
              Location
            </span>
          </div>
        </div>

        {/* ================= CENTER: NAV ================= */}
        <nav className="hidden lg:flex items-center gap-8 text-gray-300">
          {navbarLinks.map((item) => (
            <NavbarItem key={`${item.name}-${item.href}`} item={item} />
          ))}
        </nav>

        {/* ================= RIGHT: CTA ================= */}
        <div className="flex items-center gap-3">
          <Link
            href="#download"
            className="hidden sm:inline-block bg-white text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-gray-100 transition"
          >
            Get the App
          </Link>

          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-700 transition"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-700 transition"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
