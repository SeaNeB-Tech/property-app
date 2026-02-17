"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "@/styles/dynamic-pages.module.css";

/* SAME IMAGE FOR ALL PROPERTIES */
const PROPERTY_IMAGE = "/assets/propertyimages/image.png";

const properties = [
  {
    id: 1,
    title: "Naivedhya Heights",
    slug: "naivedhya_shastrinagar",
    price: "₹65 Lac",
    location: "Shastrinagar, Ahmedabad",
    type: "2 BHK Apartment",
  },
  {
    id: 2,
    title: "Shree Residency",
    slug: "shree_residency_lambhvel",
    price: "₹48 Lac",
    location: "Lambhvel, Anand",
    type: "3 BHK Flat",
  },
  {
    id: 3,
    title: "Green Valley Homes",
    slug: "green_valley_homes",
    price: "₹82 Lac",
    location: "Gota, Ahmedabad",
    type: "Villa",
  },
  {
    id: 4,
    title: "Skyline Residency",
    slug: "skyline_residency",
    price: "₹71 Lac",
    location: "Satellite, Ahmedabad",
    type: "2 BHK Apartment",
  },
  {
    id: 5,
    title: "Palm Greens",
    slug: "palm_greens",
    price: "₹55 Lac",
    location: "Bopal, Ahmedabad",
    type: "3 BHK Flat",
  },
  {
    id: 6,
    title: "Elite Enclave",
    slug: "elite_enclave",
    price: "₹1.2 Cr",
    location: "Prahlad Nagar, Ahmedabad",
    type: "Luxury Apartment",
  },
  {
    id: 7,
    title: "Riverfront Homes",
    slug: "riverfront_homes",
    price: "₹95 Lac",
    location: "Sabarmati, Ahmedabad",
    type: "River View Flat",
  },
  {
    id: 8,
    title: "Urban Nest",
    slug: "urban_nest",
    price: "₹60 Lac",
    location: "Maninagar, Ahmedabad",
    type: "2 BHK Flat",
  },
  {
    id: 9,
    title: "Harmony Villas",
    slug: "harmony_villas",
    price: "₹1.6 Cr",
    location: "South Bopal, Ahmedabad",
    type: "Villa",
  },
];

export default function BusinessListingPage({ title, subtitle }) {
  return (
    <section
      className={styles.wrapper}
      aria-labelledby="property-listing-title"
    >
      {/* SECTION HEADER */}
      <header className={styles.header}>
        <h2 id="property-listing-title">
          {title || <strong>Properties Near You</strong>}
        </h2>

        <p>
          {subtitle || (
            <>
              Browse <strong>verified</strong> residential and commercial
              properties curated for you
            </>
          )}
        </p>
      </header>

      {/* PROPERTY GRID */}
      <div className={styles.grid}>
        {properties.map((property) => (
          <Link
            key={property.id}
            href={`/${property.slug}`}
            className={styles.card}
            aria-label={`View details of ${property.title}`}
          >
            {/* IMAGE */}
            <div className={styles.imageWrap}>
              <Image
                src={PROPERTY_IMAGE}
                alt={`${property.title} property image`}
                fill
                className={styles.image}
                sizes="(max-width: 768px) 100vw, 33vw"
                priority={property.id <= 3}
              />

              <span className={styles.badge}>
                <strong>{property.type}</strong>
              </span>
            </div>

            {/* CONTENT */}
            <div className={styles.body}>
              <h3 className={styles.title}>
                <strong>{property.title}</strong>
              </h3>

              <p className={styles.location}>
                {property.location}
              </p>

              <div className={styles.footer}>
                <span className={styles.price}>
                  <strong>{property.price}</strong>
                </span>

                <span className={styles.action}>
                  View Details →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
