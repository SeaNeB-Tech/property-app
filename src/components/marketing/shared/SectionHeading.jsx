/**
 * Reusable section heading for consistent typography.
 */
export default function SectionHeading({ eyebrow, title, description, align = "left" }) {
  const alignClass = align === "center" ? "text-center" : "text-left";

  return (
    <div className={alignClass}>
      {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">{eyebrow}</p> : null}
      <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h2>
      {description ? <p className="mt-3 text-sm text-slate-600 sm:text-base">{description}</p> : null}
    </div>
  );
}
