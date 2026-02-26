import "./globals.css";
import { getAuthAppUrl, getListingAppUrl } from "@/lib/appUrls";
import { Noto_Sans } from "next/font/google";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-sans",
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
      <body className={`${notoSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
