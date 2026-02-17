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

export default function StatePage({ stateSlug }) {
  const stateName = toTitle(stateSlug);

  return (
    <>
      {/* ================= NAVBAR (SAME AS HOME) ================= */}
      <MainNavbar />

      {/* ================= HERO ================= */}
      <section className={styles.heroDarkFull}>
        <div className={styles.heroInner}>
          <p className={styles.breadcrumb}>
            Home / India / {stateName}
          </p>

          <h1 className={styles.heroTitle}>
            Properties in {stateName}
          </h1>

          <p className={styles.heroDesc}>
            Buy, rent and invest in verified properties across {stateName}.
          </p>
        </div>
      </section>

      {/* ================= CONTENT ================= */}
      <main className={styles.dynamicContainer}>

        {/* ================= MAJOR CITIES ================= */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Major Cities
          </h2>

          <div className={styles.pillGrid}>
            <Link href="/in/ahmedabad-gj" className={styles.pill}>
              Ahmedabad
            </Link>

            <Link href="/in/surat-gj" className={styles.pill}>
              Surat
            </Link>

            <Link href="/in/vadodara-gj" className={styles.pill}>
              Vadodara
            </Link>
          </div>
        </section>

        {/* ================= WHY CHOOSE ================= */}
        <section className={styles.sectionLight}>
          <h3 className={styles.sectionSubTitle}>
            Why Choose SeaNeB in {stateName}?
          </h3>

          <ul className={styles.list}>
            <li>✔ Verified listings</li>
            <li>✔ Trusted agents</li>
            <li>✔ Smart area search</li>
            <li>✔ Residential & commercial options</li>
          </ul>
        </section>

        {/* ================= CTA ================= */}
        <section className={styles.ctaBanner}>
          <div>
            <h3 className={styles.ctaTitle}>
              List Your Property in {stateName}
            </h3>

            <p className={styles.ctaDesc}>
              Reach verified buyers and renters on SeaNeB.
            </p>
          </div>

          <Link href="/partner" className={styles.ctaBtn}>
            Partner With Us
          </Link>
        </section>

        {/* ================= BACK ================= */}
        <div className={styles.backLink}>
          <Link href="/in">← Back to India</Link>
        </div>

      </main>

      {/* ================= FOOTER ================= */}</>
  );
}

