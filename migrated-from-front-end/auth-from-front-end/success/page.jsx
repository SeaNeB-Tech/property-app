"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AppHeader from "@/components/ui/AppHeader";

//  Client-only Lottie (SSR disabled)
const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

export default function SuccessPage() {
  const router = useRouter();
  const [animationData, setAnimationData] = useState(null);

  useEffect(() => {
    let mounted = true;

    fetch("/Lottie/success.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load Lottie JSON");
        }
        return res.json();
      })
      .then((data) => {
        if (mounted) {
          console.log(" Lottie JSON loaded");
          setAnimationData(data);
        }
      })
      .catch((err) => {
        console.error(" Lottie load error:", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <AppHeader showLogout={false} />
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
        <div className="bg-white rounded-2xl shadow-md px-10 py-12 w-full max-w-md text-center">

        {/* BIG & CONTINUOUS ANIMATION */}
        <div className="flex justify-center items-center mb-8">
          {animationData ? (
            <Lottie
              key="success-animation"
              animationData={animationData}
              autoplay
              loop={true}              
              renderer="svg"
              style={{
                width: 220,           
                height: 220,
              }}
            />
          ) : (
            <div style={{ width: 220, height: 220 }} />
          )}
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Registration Successful
        </h1>

        <p className="text-sm text-gray-500 mb-8">
          Your profile has been completed successfully.
        </p>

        <button
          onClick={() => router.push("/dashboard")}
          className="w-full bg-gray-700 hover:bg-gray-800 text-white py-3 rounded-lg font-medium transition"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
    </>
  );
}
