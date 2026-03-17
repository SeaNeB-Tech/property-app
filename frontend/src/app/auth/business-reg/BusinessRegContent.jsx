"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function BusinessRegContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.toString();
    const target = query
      ? `/auth/business-register?${query}`
      : "/auth/business-register";
    window.location.replace(target);
  }, [searchParams]);

  return null;
}
