"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DASHBOARD_MODE_BUSINESS,
  getDashboardMode,
  isBusinessRegistered,
} from "@/services/dashboardMode.service";
import "../styles/sidebar-colors.css";

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dashboardMode = getDashboardMode();
  const hasBusiness = isBusinessRegistered();

  const menuItems = useMemo(() => {
    if (hasBusiness && dashboardMode === DASHBOARD_MODE_BUSINESS) {
      return [
        { label: "Business Home", href: "/dashboard/broker", icon: "BH" },
        { label: "Listings", href: "/dashboard/listings", icon: "LS" },
        { label: "Analytics", href: "/dashboard/analytics", icon: "AN" },
        { label: "Products", href: "/dashboard/products", icon: "PR" },
        { label: "Settings", href: "/dashboard/settings", icon: "ST" },
        { label: "Help", href: "/dashboard/help", icon: "HP" },
      ];
    }

    return [
      { label: "Dashboard", href: "/dashboard", icon: "DB" },
      { label: "Products", href: "/dashboard/products", icon: "PR" },
      { label: "Settings", href: "/dashboard/settings", icon: "ST" },
      { label: "Help", href: "/dashboard/help", icon: "HP" },
    ];
  }, [dashboardMode, hasBusiness]);

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/broker") return pathname === "/dashboard/broker";
    return pathname === href || pathname.startsWith(href);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 top-16 z-50 block rounded-md bg-[var(--sidebar-primary)] p-2 text-white transition-colors hover:bg-[var(--sidebar-primary-dark)] lg:hidden"
        aria-label="Toggle sidebar"
      >
        {isOpen ? "X" : "|||"}
      </button>

      <aside
        className={`fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 transform bg-gradient-to-b from-[var(--sidebar-primary)] to-[var(--sidebar-primary-dark)] text-white shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="flex h-full flex-col">
          <div className="hidden border-b border-[var(--sidebar-border)] px-6 py-8 lg:block">
            <h2 className="mb-1 text-2xl font-bold text-[var(--sidebar-accent)]">SeaNeB</h2>
            <p className="text-xs font-medium text-[var(--sidebar-text-secondary)]">Real Estate Platform</p>
          </div>

          <ul className="flex-1 space-y-2 overflow-y-auto px-2 py-6">
            {menuItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`sidebar-menu-item flex items-center gap-3 rounded-xl px-4 py-3 font-medium transition-all duration-200 ${
                    isActive(item.href)
                      ? "active bg-[var(--sidebar-hover)] text-white shadow-lg"
                      : "text-[var(--sidebar-text)] hover:bg-black/20"
                  }`}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold tracking-wide text-white">
                    {item.icon}
                  </span>
                  <span className="truncate text-sm">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="space-y-4 border-t border-[color:var(--sidebar-border)]/50 px-6 py-6">
            <div className="text-xs font-medium text-[var(--sidebar-text-secondary)]">
              <p className="mb-1">SeaNeB Platform</p>
              <p className="text-[10px]">© 2026 All Rights Reserved</p>
            </div>
          </div>
        </nav>
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setIsOpen(false)} />
      )}
    </>
  );
}
