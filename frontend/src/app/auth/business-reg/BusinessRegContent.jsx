"use client";

import { useEffect } from "react";

export default function BusinessRegContent() {
  useEffect(() => {
    window.location.replace("/auth/business-register");
  }, []);

  return null;
}
