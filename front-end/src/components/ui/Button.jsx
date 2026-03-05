"use client";

export default function Button({
  label,
  type = "button",
  onClick,
  loading = false,
  disabled = false,
  className = "",
}) {
  const handleClick = (e) => {
    onClick?.(e);
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`w-full py-3 rounded-md text-sm font-medium transition bg-gray-900 text-white hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? "Please wait..." : label}
    </button>
  );
}
