"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import BrandLogo from "./BrandLogo";
import { getCookie } from "@/services/cookie";

const footerGroups = [
  {
    title: "Platform",
    links: [
      { label: "Home", href: "/home" },
      { label: "Browse India", href: "/in" },
      { label: "Login", href: "/auth/login" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About SeaNeB", href: "/about" },
      { label: "Solution", href: "/solution" },
      { label: "Partner With Us", href: "/partner" },
      { label: "Blogs", href: "/blogs" },
      { label: "Careers", href: "#" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "/dashboard/help" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy Policy", href: "#" },
      { label: "Terms & Conditions", href: "#" },
    ],
  },
];

const socialLinks = [
  { label: "FB", href: "https://www.facebook.com/TiffinServiceApp/" },
  { label: "X", href: "https://x.com/tiffinserviceap" },
  { label: "IN", href: "https://www.linkedin.com/showcase/tiffinserviceapp/" },
  { label: "YT", href: "https://www.youtube.com/@tiffinserviceapp" },
  { label: "IG", href: "https://www.instagram.com/tiffinserviceapp" },
  { label: "PT", href: "https://in.pinterest.com/TiffinServiceApp/" },
];

export default function GlobalFooter() {
  const pathname = usePathname();
  const isDashboardRoute = pathname?.startsWith("/dashboard");
  const isAuthenticated = useSyncExternalStore(
    () => () => {},
    () =>
      getCookie("profile_completed") === "true" ||
      Boolean(getCookie("access_token")) ||
      Boolean(getCookie("session_start_time")),
    () => false
  );

  const visibleFooterGroups = footerGroups.map((group) => ({
    ...group,
    links: group.links.filter((link) => {
      if (!link.href.startsWith("/dashboard")) return true;
      return isAuthenticated;
    }),
  }));

  return (
    <footer className={`mt-12 border-t border-slate-200 bg-gradient-to-b from-slate-950 to-slate-900 text-slate-200 ${isDashboardRoute ? "lg:pl-64" : ""}`}>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <BrandLogo
            size={42}
            titleClass="text-lg font-bold text-white"
            subtitleClass="text-xs font-medium text-slate-400"
          />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
            SeaNeB helps buyers, renters, and brokers discover verified residential and commercial properties with a smoother search experience.
          </p>
          <div className="mt-5 flex gap-2">
            {socialLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.label}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-[11px] font-semibold text-slate-200 transition-colors hover:border-slate-300 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 lg:col-span-7">
          {visibleFooterGroups.map((group) => (
            <div key={group.title}>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white">{group.title}</h4>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-slate-300 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-400 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} SeaNeB. All rights reserved.
      </div>
    </footer>
  );
}
