"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export default function AuthTransitionOverlay({
  title = "Please wait...",
  description = "We are processing your request.",
}) {
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    let mounted = true;

    fetch("/Lottie/success.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load transition animation");
        }
        return res.json();
      })
      .then((data) => {
        if (mounted) {
          setAnimationData(data);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="min-h-screen flex items-center justify-center bg-gray-50 p-6"
    >
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 text-center shadow-md">
        <div className="mb-6 flex justify-center">
          {animationData ? (
            <Lottie
              animationData={animationData}
              autoplay
              loop
              renderer="svg"
              style={{ width: 200, height: 200 }}
            />
          ) : (
            <div className="h-[200px] w-[200px]" aria-hidden="true" />
          )}
        </div>

        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      </div>
    </div>
  );
}
