import { ItemStatus, STATUS_CLASSES, STATUS_DOT } from "@/types";

interface StatsBarProps {
  items: Array<{ status: string }>;
  /** Currently active status filter, or null for "all". */
  statusFilter: ItemStatus | null;
  /** Called with the new filter value when a card is clicked. */
  onStatusFilterChange: (status: ItemStatus | null) => void;
}

const STATS: { status: ItemStatus; label: string }[] = [
  { status: "Executed", label: "Executed" },
  { status: "Under Review", label: "Under Review" },
  { status: "Outstanding", label: "Outstanding" },
  { status: "Waived", label: "Waived" },
];

export function StatsBar({ items, statusFilter, onStatusFilterChange }: StatsBarProps) {
  const total = items.length;

  return (
    <div className="flex items-stretch gap-3 flex-wrap">
      {STATS.map(({ status, label }) => {
        const count = items.filter((i) => i.status === status).length;
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        const active = statusFilter === status;

        return (
          <button
            key={status}
            type="button"
            onClick={() => onStatusFilterChange(active ? null : status)}
            className={[
              "flex-1 min-w-[120px] flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all",
              STATUS_CLASSES[status],
              active
                ? "ring-2 ring-offset-1 ring-primary shadow-md scale-[1.02]"
                : "hover:shadow-sm hover:scale-[1.01] cursor-pointer",
            ].join(" ")}
            aria-pressed={active}
            title={active ? `Clear ${label} filter` : `Filter by ${label}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
              <p className="text-2xl font-bold leading-none mt-0.5">{count}</p>
            </div>
            <span className="text-xs font-medium opacity-50 self-end pb-0.5">{pct}%</span>
          </button>
        );
      })}

      {/* Total Items — resets filter */}
      <button
        type="button"
        onClick={() => onStatusFilterChange(null)}
        className={[
          "flex-1 min-w-[120px] flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all",
          statusFilter === null
            ? "border-primary bg-primary/5 ring-2 ring-offset-1 ring-primary shadow-md scale-[1.02]"
            : "border-border bg-card hover:shadow-sm hover:scale-[1.01] cursor-pointer",
        ].join(" ")}
        aria-pressed={statusFilter === null}
        title="Show all items"
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-primary/30" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Items</p>
          <p className="text-2xl font-bold leading-none mt-0.5 text-foreground">{total}</p>
        </div>
      </button>
    </div>
  );
}
