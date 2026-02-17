"use client";

import Link from "next/link";
import MainNavbar from "@/components/ui/MainNavbar";
import styles from "@/styles/dynamic-pages.module.css";

function toTitle(slug) {
  if (!slug) return "";
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CityPage({ citySlug }) {
  const cityName = toTitle(citySlug?.split("-")[0]);
  const stateName = toTitle(citySlug?.split("-").slice(1).join(" "));

  return (
    <>
      {/* ================= NAVBAR ================= */}
      <MainNavbar />

      {/* ================= DARK HERO ================= */}
      <section className={styles.heroDarkFull}>
        <div className={styles.heroInner}>
          <p className={styles.breadcrumb}>
            Home / India / {stateName} / {cityName}
          </p>

          <h1 className={styles.heroTitle}>
            Properties in {cityName}
          </h1>

          <p className={styles.heroDesc}>
            Explore verified residential and commercial properties
            across {cityName}. Buy, rent, or invest with confidence.
          </p>
        </div>
      </section>

      {/* ================= CONTENT ================= */}
      <main className={styles.dynamicContainer}>

        {/* ================= AREAS ================= */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Popular Areas in {cityName}
          </h2>

          <div className={styles.pillGrid}>
            <Link
              href={`/in/nirnay-nagar-${citySlug}`}
              className={styles.cityPill}
            >
              Nirnay Nagar
            </Link>

            <Link
              href={`/in/gota-${citySlug}`}
              className={styles.cityPill}
            >
              Gota
            </Link>

            <Link
              href={`/in/chandkheda-${citySlug}`}
              className={styles.cityPill}
            >
              Chandkheda
            </Link>
          </div>
        </section>

        {/* ================= WHY CITY ================= */}
        <section className={styles.sectionLight}>
          <h3 className={styles.sectionSubTitle}>
            Why Buy Property in {cityName}?
          </h3>

          <ul className={styles.list}>
            <li>✔ Verified listings only</li>
            <li>✔ Trusted local agents</li>
            <li>✔ Smart area-based search</li>
            <li>✔ Residential & commercial options</li>
          </ul>
        </section>

        {/* ================= CTA ================= */}
        <section className={styles.cityCtaBanner}>
          <div>
            <h3 className={styles.ctaTitle}>
              List Your Property in {cityName}
            </h3>
            <p className={styles.ctaDesc}>
              Reach verified buyers and renters in your city.
            </p>
          </div>

          <Link href="/partner" className={styles.ctaBtn}>
            Partner With Us
          </Link>
        </section>

        {/* ================= BACK ================= */}
        <div className={styles.backLink}>
          <Link href={`/in/${stateName.toLowerCase().replace(/\s+/g, "-")}`}>
            ← Back to {stateName}
          </Link>
        </div>

      </main></>
  );
}

