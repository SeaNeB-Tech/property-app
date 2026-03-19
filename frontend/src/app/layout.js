import "./globals.css";
import { getAuthAppUrl, getListingAppUrl } from "@/lib/core/appUrls";
import { Noto_Sans } from "next/font/google";
import AuthProviderClient from "@/components/providers/AuthProviderClient";
import { GTMScript, GTMNoScript, GTMAnalytics } from "@/components/GoogleTagManager";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-sans",
});

const tryParseUrl = (value) => {
  try {
    return new URL(String(value || "").trim());
  } catch {
    return null;
  }
};

const authHomeUrl = getAuthAppUrl("/");
const listingCanonicalUrl = getListingAppUrl("/home");
const metadataBaseUrl = tryParseUrl(authHomeUrl);
const canonicalUrl = tryParseUrl(listingCanonicalUrl)?.toString() || "";

export const metadata = {
  ...(metadataBaseUrl ? { metadataBase: metadataBaseUrl } : {}),
  title: "SeaNeB Property Panel",
  description: "SeaNeB Property authentication and panel application",
  ...(canonicalUrl
    ? {
        alternates: {
          canonical: canonicalUrl,
        },
      }
    : {}),
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  icons: {
    icon: [
      { url: "/logos/Fav.svg", type: "image/svg+xml" },
      { url: "/logos/Fav.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/logos/Fav.png",
    apple: "/logos/Fav.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <GTMScript />
      </head>
      <body className={`${notoSans.variable} antialiased`}>
        <GTMNoScript />
        <GTMAnalytics />
        <AuthProviderClient>{children}</AuthProviderClient>
      </body>
    </html>
  );
}
