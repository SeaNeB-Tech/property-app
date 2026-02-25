import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getAuthAppUrl, getListingAppUrl } from "@/lib/appUrls";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL(getAuthAppUrl("/")),
  title: "SeaNeB Property Panel",
  description: "SeaNeB Property authentication and panel application",
  alternates: {
    canonical: getListingAppUrl("/home"),
  },
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
