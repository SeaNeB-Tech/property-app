"use client";

import Link from "next/link";
import MainNavbar from "@/components/ui/MainNavbar";
import pageStyles from "@/styles/dynamic-pages.module.css";
import styles from "@/styles/business-detail.module.css";

export default function BusinessDetail({ businessSlug }) {
  const businessName = businessSlug
    ? businessSlug
        .replace(/_/g, " ")
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    : "Business";

  return (
    <>
      <MainNavbar />
      <div className={styles.businessWrapper}>
        <div className={pageStyles.dynamicContainer}>
          <div className={styles.container}>
            <p className={styles.breadcrumb}>Home / Areas / {businessName}</p>
            <h1 className={styles.title}>{businessName}</h1>
            <p className={styles.desc}>Business detail page for {businessName}.</p>

            <div className={styles.ratingRow}>
              <div>★ 4.5</div>
              <div>(23 reviews)</div>
            </div>

            <h3>Contact Information</h3>
            <p><strong>Address:</strong> 123 Example Street</p>
            <p><strong>Phone:</strong> +91 98765 43210</p>

            <h3 className="mt-4">Why Choose Us?</h3>
            <ul className={styles.features}>
              <li>✔ Verified listings</li>
              <li>✔ Trusted agents</li>
              <li>✔ Quick response</li>
            </ul>

            <a className={styles.contactBtn}>Contact Now</a>

            <div style={{marginTop:16}}>
              <Link href="/in" className="text-sm text-gray-500">← Back to Areas</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
