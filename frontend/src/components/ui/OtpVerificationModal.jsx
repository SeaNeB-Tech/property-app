"use client";

import OtpInput from "@/components/ui/OtpInput";

export default function OtpVerificationModal({
  open,
  title = "Verify OTP",
  subtitle = "",
  targetLabel = "",
  helperText = "",
  otp,
  onOtpChange,
  onClose,
  onVerify,
  onResend,
  resendLabel = "Resend OTP",
  onSecondaryResend,
  secondaryResendLabel = "",
  loading = false,
  resending = false,
  cooldown = 0,
  error = "",
  clearSignal = 0,
  labels = {},
}) {
  if (!open) return null;

  const isValid = String(otp || "").length === 4;
  const badgeLabel = labels.badge || "Secure verification";
  const closeLabel = labels.close || "Close";
  const instructionText =
    labels.instruction || "Enter the 4-digit code. You can paste the full OTP into the first box.";
  const verifyLabel = labels.verify || "Verify OTP";
  const verifyingLabel = labels.verifying || "Verifying...";
  const sendingLabel = labels.sending || "Sending...";
  const resendAvailableIn =
    labels.resendAvailableIn || "Resend available in {seconds}s";

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
      <form
        className="w-full max-w-lg overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh]"
        onSubmit={(event) => {
          event.preventDefault();
          onVerify?.();
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
              {badgeLabel}
            </span>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            {targetLabel ? <p className="mt-2 text-sm font-semibold text-slate-900">{targetLabel}</p> : null}
            {helperText ? <p className="mt-2 text-sm leading-6 text-slate-500">{helperText}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100"
          >
            {closeLabel}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5">
          <div className="flex justify-center">
          <OtpInput length={4} onChange={onOtpChange} clearSignal={clearSignal} />
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            {instructionText}
          </p>
        </div>

        {error ? <p className="mt-3 text-center text-sm text-red-500">{error}</p> : null}

        <div className="mt-5">
          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {loading ? verifyingLabel : verifyLabel}
          </button>
        </div>

        <div className="mt-4 text-center text-sm">
          {cooldown > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">
              {resendAvailableIn.replace("{seconds}", String(cooldown))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onResend}
                disabled={resending}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-400"
              >
                {resending ? sendingLabel : resendLabel}
              </button>
              {secondaryResendLabel && typeof onSecondaryResend === "function" ? (
                <button
                  type="button"
                  onClick={onSecondaryResend}
                  disabled={resending}
                  className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:text-slate-400"
                >
                  {resending ? sendingLabel : secondaryResendLabel}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
