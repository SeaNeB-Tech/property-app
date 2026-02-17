"use client";

import Link from "next/link";
import MainNavbar from "@/components/ui/MainNavbar";
import styles from "@/styles/dynamic-pages.module.css";

export default function CountryPage({ countrySlug = "india" }) {
  const countryName =
    countrySlug.charAt(0).toUpperCase() + countrySlug.slice(1);

  const states = [
    "gujarat",
    "maharashtra",
    "madhya pradesh",
    "himachal pradesh",
    "odisha",
    "rajasthan",
  ];

  return (
    <>
  {/* this is navbar component  */}
      <MainNavbar />

   {/* this is the hero section of country page */}
      <section className={styles.countryHero}>
        <div className={styles.countryHeroInner}>
          <p className={styles.countryBreadcrumb}>
            Home / Countries / {countryName}
          </p>

          <h1 className={styles.countryHeroTitle}>
            Properties in {countryName}
          </h1>

          <p className={styles.countryHeroDesc}>
            Discover verified residential and commercial properties across{" "}
            {countryName}. Buy, rent, or invest with confidence on SeaNeB.
          </p>
        </div>
      </section>

{/* this is the hero section of country page */}
      <section className={styles.countrySection}>
        <div className={styles.dynamicContainer}>
          <h2 className={styles.countrySectionTitle}>
            Browse States in {countryName}
          </h2>

          <p className={styles.countrySectionDesc}>
            Explore real estate opportunities by state
          </p>

          <div className={styles.countryGrid}>
            {states.map((state) => (
              <Link
                key={state}
                href={`/in/${state.replace(/\s+/g, "-")}`}
                className={styles.countryCard}
              >
                {state}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className={styles.countryCta}>
        <div className={styles.countryCtaInner}>
          <h2 className={styles.countryCtaTitle}>
            Want to List Your Property in {countryName}?
          </h2>

          <p className={styles.countryCtaDesc}>
            Reach verified buyers and renters across the country.
          </p>

          <Link href="/partner" className={styles.countryCtaBtn}>
            Partner With SeaNeB →
          </Link>
        </div>
      </section></>
  );
}

