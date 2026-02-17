"use client";

import Link from "next/link";
import MainNavbar from "@/components/ui/MainNavbar";
import BusinessListingPage from "./BusinessListingPage";
import styles from "@/styles/dynamic-pages.module.css";

/* ---------------- helper ---------------- */

function toTitle(slug) {
  if (!slug) return "";
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AreaPage({ areaSlug }) {
  if (!areaSlug) return null;

  const parts = areaSlug.split("-");

  const areaName = toTitle(parts.slice(0, 2).join(" "));
  const cityName = toTitle(parts[2]);
  const stateCode = parts[3]?.toUpperCase() || "";

  return (
    <>
      {/* ================= NAVBAR ================= */}
      <MainNavbar />

      {/* ================= DARK HERO ================= */}
      <section className={styles.heroDarkFull}>
        <div className={styles.heroInner}>
          <p className={styles.breadcrumb}>
            Home / India / {stateCode} / {cityName} / {areaName}
          </p>

          <h1 className={styles.heroTitle}>
            Properties in {areaName}
          </h1>

          <p className={styles.heroDesc}>
            Explore verified residential and commercial properties
            in {areaName}, {cityName}. Buy, rent, or invest confidently.
          </p>
        </div>
      </section>

      {/* ================= CONTENT ================= */}
      <main className={styles.dynamicContainer}>

        {/* WHY AREA */}
        <section className={styles.sectionLight}>
          <h3 className={styles.sectionSubTitle}>
            Why Buy Property in {areaName}?
          </h3>

          <ul className={styles.list}>
            <li>✔ Premium residential locality</li>
            <li>✔ Excellent connectivity</li>
            <li>✔ Trusted local agents</li>
            <li>✔ Verified property listings</li>
          </ul>
        </section>

        {/*BUSINESS LISTING */}
        <BusinessListingPage areaSlug={areaSlug} />

        {/* CTA */}
        <section className={styles.cityCtaBanner}>
          <div>
            <h3 className={styles.ctaTitle}>
              List Your Property in {areaName}
            </h3>
            <p className={styles.ctaDesc}>
              Reach serious buyers and renters in {cityName}.
            </p>
          </div>

          <Link href="/partner" className={styles.ctaBtn}>
            Partner With Us
          </Link>
        </section>

        {/* BACK LINK */}
        <div className={styles.backLink}>
          <Link href={`/in/${cityName.toLowerCase()}-${stateCode.toLowerCase()}`}>
            ← Back to {cityName}
          </Link>
        </div>

      </main>

      {/* this is the footer component that we are using in all the pages. */}</>
  );
}

