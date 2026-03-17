"use client";

import { useCallback, useEffect, useRef } from "react";

export default function OtpInput({ length = 4, onChange, clearSignal = 0 }) {
  const inputsRef = useRef([]);

  const emitOtp = useCallback(() => {
    const otp = inputsRef.current.map((input) => input?.value || "").join("");
    onChange?.(otp);
  }, [onChange]);

  useEffect(() => {
    inputsRef.current.forEach((input) => {
      if (input) input.value = "";
    });
    emitOtp();
    const focusFirstInput = () => {
      inputsRef.current[0]?.focus();
      inputsRef.current[0]?.select?.();
    };
    const frameId = window.requestAnimationFrame(focusFirstInput);
    return () => window.cancelAnimationFrame(frameId);
  }, [clearSignal, emitOtp]);

  const handleChange = (e, index) => {
    const cleaned = e.target.value.replace(/\D/g, "");

    if (!cleaned) {
      e.target.value = "";
      emitOtp();
      return;
    }

    const digit = cleaned.slice(-1);
    e.target.value = digit;

    if (index < length - 1) inputsRef.current[index + 1]?.focus();
    emitOtp();
  };

  const handleKeyDown = (e, index) => {
    if (e.key !== "Backspace") return;

    if (inputsRef.current[index]?.value) {
      inputsRef.current[index].value = "";
      emitOtp();
      return;
    }

    if (index > 0) {
      const prev = inputsRef.current[index - 1];
      if (prev) {
        prev.value = "";
        prev.focus();
      }
      emitOtp();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, length);

    if (!pasted) return;

    for (let i = 0; i < length; i += 1) {
      const input = inputsRef.current[i];
      if (!input) continue;
      input.value = pasted[i] || "";
    }

    const focusIndex = Math.min(pasted.length, length - 1);
    inputsRef.current[focusIndex]?.focus();
    emitOtp();
  };

  return (
    <div className="flex gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="password"
          maxLength={1}
          autoFocus={i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          aria-label={`OTP digit ${i + 1}`}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          className="h-14 w-14 rounded-2xl border border-slate-300 bg-white text-center text-xl font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-blue-50 focus:ring-4 focus:ring-blue-100"
        />
      ))}
    </div>
  );
}
