"use client";

const badgeToneClassName = {
  danger: "border-[#f1c8cf] bg-[#fff1f3] text-[#b42318]",
  neutral: "border-black/10 bg-[#f3f4f6] text-[#5f6670]",
};

const joinClasses = (...values) => values.filter(Boolean).join(" ");

export function SidebarNav({
  items,
  activeItem,
  onSelect,
  businessName = "Business dashboard",
  planLabel = "",
  logoText = "BD",
}) {
  const groups = [];

  for (const item of items) {
    const existingGroup = groups.find((group) => group.label === item.group);
    if (existingGroup) {
      existingGroup.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
  }

  return (
    <aside className="w-full self-start lg:sticky lg:top-6 lg:w-[200px]">
      <div className="flex flex-col gap-4 rounded-[12px] border-[0.5px] border-black/10 bg-[#f7f7f8] p-3">
        <div className="rounded-[12px] border-[0.5px] border-black/10 bg-white p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border-[0.5px] border-black/10 bg-[#f1f2f4] text-[12px] font-medium text-[#1f2328]">
              {logoText}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-[#1f2328]">
                {businessName}
              </p>
              {planLabel ? (
                <span className="mt-2 inline-flex rounded-full border-[0.5px] border-[#cfe9d5] bg-[#edf8ef] px-2 py-0.5 text-[11px] font-medium text-[#1f7a3d]">
                  {planLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <nav className="space-y-3">
          {groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8a9099]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === activeItem;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className={joinClasses(
                        "flex w-full items-center justify-between gap-3 rounded-[8px] border-[0.5px] px-3 py-2.5 text-left transition",
                        isActive
                          ? "border-black/10 bg-white"
                          : "border-transparent bg-transparent hover:border-black/10 hover:bg-[#fbfbfc]"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={joinClasses(
                            "flex h-7 w-7 items-center justify-center rounded-[8px] border-[0.5px] border-black/10 text-[#5f6670]",
                            isActive ? "bg-[#f4f5f6]" : "bg-white"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate text-[12px] font-medium text-[#1f2328]">
                          {item.label}
                        </span>
                      </span>

                      {typeof item.count === "number" ? (
                        <span
                          className={`inline-flex min-w-[22px] justify-center rounded-full border-[0.5px] px-1.5 py-0.5 text-[11px] font-medium ${badgeToneClassName[item.badgeTone] || badgeToneClassName.neutral}`}
                        >
                          {item.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
