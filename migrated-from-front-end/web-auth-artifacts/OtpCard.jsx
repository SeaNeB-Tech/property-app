"use client";

export default function OtpCard({
  header,
  title,
  subtitle,
  children,
  onSubmit,
  submitText,
  disabled
}) {
  return (
    <div className="page-center">
      <div className="auth-card otp-card">

        {/* Reusable Auth Header */}
        {header && header}

        {/* Page content */}
        {children}

        {/* Submit Button */}
        {submitText && (
          <button
            disabled={disabled}
            onClick={onSubmit}
            className={`primary-btn ${disabled ? "disabled-btn" : ""}`}
          >
            {submitText}
          </button>
        )}

      </div>
    </div>
  );
}
