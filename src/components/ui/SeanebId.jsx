"use client";

import { useMemo, useState } from "react";
import { checkSeanebId } from "@/services/seaneb.service";

export default function SeanebIdField({ value, onChange, verified, setVerified }) {
  const [checking, setChecking] = useState(false);

  const seanebRegex = /^[a-z0-9-]{6,30}$/;
  const isValidSeaneb = seanebRegex.test(value);

  const seanebError = useMemo(() => {
    if (!value) return "";
    if (!isValidSeaneb) {
      return "6-30 characters. Lowercase letters, numbers, and hyphen (-) only.";
    }
    return "";
  }, [value, isValidSeaneb]);

  const handleVerify = async () => {
    if (!isValidSeaneb || checking || verified) return;

    try {
      setChecking(true);
      await checkSeanebId(value);
      setVerified(true);
    } catch (err) {
      setVerified(false);
      const status = err?.response?.status;

      if (status === 409) {
        alert("SeaNeB ID already exists");
      } else if (status === 400) {
        alert("Invalid SeaNeB ID");
      } else {
        console.error("SeaNeB verify failed:", err);
        alert("Unable to verify SeaNeB ID");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-1.5 md:col-span-2">
      <label className="text-sm font-medium text-slate-800">SeaNeB ID *</label>

      <div className="flex items-center gap-2">
        <input
          type="text"
          className={`h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition-all ${
            verified
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          }`}
          value={value}
          placeholder="username01"
          disabled={verified}
          onChange={(e) => {
            const next = e.target.value.toLowerCase();
            setVerified(false);
            onChange(next);
          }}
        />

        <button
          type="button"
          className={`h-11 min-w-[110px] rounded-lg border px-4 text-sm font-semibold transition-all ${
            verified
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          } disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500`}
          disabled={!isValidSeaneb || checking || verified}
          onClick={handleVerify}
        >
          {checking ? "Checking..." : verified ? "Verified" : "Verify"}
        </button>
      </div>

      {(value || seanebError) && (
        <p className={`mt-1 text-xs ${seanebError ? "text-red-500" : "text-slate-500"}`}>
          {seanebError || "6-30 characters. Lowercase letters, numbers, and hyphen (-) only."}
        </p>
      )}
    </div>
  );
}
