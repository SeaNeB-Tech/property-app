"use client";

import Image from "next/image";
import { useState } from "react";

export default function BrandLogo({
  size = 44,
  iconSrc = "/logos/Fav.svg",
  fallbackIconSrc = "/logos/Fav.png",
  showText = true,
  titleClass = "text-xl font-bold text-gray-900",
  subtitleClass = "text-xs font-medium text-gray-600",
  textWrapperClass = "",
  compact = false,
}) {
  const [src, setSrc] = useState(iconSrc);

  return (
    <div className="flex items-center gap-3">
      <Image
        src={src}
        alt="SeaNeB"
        width={size}
        height={size}
        className="object-contain shrink-0"
        onError={() => {
          if (src !== fallbackIconSrc) setSrc(fallbackIconSrc);
        }}
        priority
      />
      {showText && (
        <div className={`${compact ? "leading-tight" : ""} ${textWrapperClass}`.trim()}>
          <div className={titleClass}>SeaNeB</div>
          <div className={subtitleClass}>Real Estate</div>
        </div>
      )}
    </div>
  );
}
