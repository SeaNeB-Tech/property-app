"use client"

import Link from "next/link";
import LanguageDropdown from "./LanguageDropdown";
import BrandLogo from "./BrandLogo";

export default function AuthHeader({ language, setLanguage }) {
  return (
    <div className="auth-header">
      <Link href="/" className="hover:opacity-80 transition">
        <BrandLogo
          size={40}
          titleClass="text-2xl font-semibold text-gray-900"
          subtitleClass="text-xs font-medium tracking-wide text-gray-600 uppercase"
          compact
        />
      </Link>

      <LanguageDropdown language={language} onChange={setLanguage} />
    </div>
  )
}
