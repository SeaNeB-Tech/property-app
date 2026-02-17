"use client";

import Button from "@/components/ui/Button";
import OtpInput from "@/components/ui/OtpInput";

export default function OtpVerificationModal({
  open,
  title = "Verify OTP",
  subtitle = "",
  targetLabel = "",
  otp,
  onOtpChange,
  onClose,
  onVerify,
  onResend,
  loading = false,
  resending = false,
  cooldown = 0,
  error = "",
  clearSignal = 0,
}) {
  if (!open) return null;

  const isValid = String(otp || "").length === 4;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            {targetLabel ? <p className="mt-1 text-sm font-medium text-slate-900">{targetLabel}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="flex justify-center">
          <OtpInput length={4} onChange={onOtpChange} clearSignal={clearSignal} />
        </div>

        {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}

        <div className="mt-5">
          <Button
            label={loading ? "Verifying..." : "Verify OTP"}
            loading={loading}
            disabled={!isValid || loading}
            onClick={onVerify}
          />
        </div>

        <div className="mt-3 text-center text-sm">
          {cooldown > 0 ? (
            <span className="text-slate-400">Resend in {cooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="text-blue-600 disabled:text-slate-400"
            >
              {resending ? "Sending..." : "Resend OTP"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
