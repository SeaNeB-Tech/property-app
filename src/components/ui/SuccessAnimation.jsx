"use client";

import dynamic from "next/dynamic";
import successAnimation from "/lottie/success.json";


const Lottie = dynamic(() => import("lottie-react"), {
  ssr: false,
});

export default function SuccessAnimation() {
  return (
    <div
      style={{ width: 140, height: 140 }}
      className="flex items-center justify-center"
    >
      <Lottie
        animationData={successAnimation}
        autoplay
        loop={false}
        renderer="svg"
      />
    </div>
  );
}
