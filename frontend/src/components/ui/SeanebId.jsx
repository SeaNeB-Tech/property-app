"use client";

import { useMemo, useState } from "react";
import { checkSeanebId } from "@/services/user.service";

export default function SeanebIdField({
  value,
  onChange,
  verified,
  setVerified,
  labels = {},
}) {
  const [checking, setChecking] = useState(false);
  const label = labels.label || "SeaNeB ID *";
  const placeholder = labels.placeholder || "username01";
  const verifyLabel = labels.verify || "Verify";
  const editLabel = labels.edit || "Edit";
  const checkingLabel = labels.checking || "Checking...";
  const hint = labels.hint || "6-30 characters. Lowercase letters, numbers, and hyphen (-) only.";
  const existsError = labels.existsError || "SeaNeB ID already exists";
  const invalidError = labels.invalidError || "Invalid SeaNeB ID";
  const unavailableError = labels.unavailableError || "Unable to verify SeaNeB ID";

  const seanebRegex = /^[a-z0-9-]{6,30}$/;
  const isValidSeaneb = seanebRegex.test(value);

  const seanebError = useMemo(() => {
    if (!value) return "";
    if (!isValidSeaneb) {
      return hint;
    }
    return "";
  }, [value, isValidSeaneb, hint]);

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
        alert(existsError);
      } else if (status === 400) {
        alert(invalidError);
      } else {
        console.error("SeaNeB verify failed:", err);
        alert(unavailableError);
      }
    } finally {
      setChecking(false);
    }
  };

  const handleEdit = () => {
    if (!verified || checking) return;
    setVerified(false);
  };

  return (
    <div className="space-y-1.5 md:col-span-2">
      <label className="text-sm font-medium text-slate-800">{label}</label>

      <div className="flex items-center gap-2">
        <input
          type="text"
          className={`h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition-all ${
            verified
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          }`}
          value={value}
          placeholder={placeholder}
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
              ? "border-amber-500 bg-amber-500 text-white hover:bg-amber-600"
              : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          } disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500`}
          disabled={checking || (!verified && !isValidSeaneb)}
          onClick={verified ? handleEdit : handleVerify}
        >
          {checking ? checkingLabel : verified ? editLabel : verifyLabel}
        </button>
      </div>

      {(value || seanebError) && (
        <p className={`mt-1 text-xs ${seanebError ? "text-red-500" : "text-slate-500"}`}>
          {seanebError || hint}
        </p>
      )}
    </div>
  );
}
