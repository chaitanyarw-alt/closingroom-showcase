import { trpc } from "@/lib/trpc";
import { History, Loader2 } from "lucide-react";

interface AuditPanelProps {
  dealId: number;
}

const ACTION_LABELS: Record<string, string> = {
  deal_created: "Deal created",
  deal_updated: "Deal updated",
  item_created: "Item added",
  status_changed: "Status changed",
  deadline_set: "Deadline set",
  document_uploaded: "Document uploaded",
  ai_extraction: "AI extraction",
  cp_waived: "CP waived",
  memo_generated: "Memo generated",
  member_invited: "Member invited",
  member_removed: "Member removed",
  signature_added: "Signature added",
  signature_status_updated: "Signature updated",
};

const ACTION_COLORS: Record<string, string> = {
  deal_created: "bg-primary/20 text-primary",
  deal_updated: "bg-muted text-muted-foreground",
  item_created: "bg-blue-100 text-blue-700",
  status_changed: "bg-amber-100 text-amber-700",
  deadline_set: "bg-orange-100 text-orange-700",
  document_uploaded: "bg-purple-100 text-purple-700",
  ai_extraction: "bg-violet-100 text-violet-700",
  cp_waived: "bg-rose-100 text-rose-700",
  memo_generated: "bg-emerald-100 text-emerald-700",
  member_invited: "bg-sky-100 text-sky-700",
  member_removed: "bg-red-100 text-red-700",
  signature_added: "bg-teal-100 text-teal-700",
  signature_status_updated: "bg-teal-100 text-teal-700",
};

export function AuditPanel({ dealId }: AuditPanelProps) {
  const { data: log, isLoading } = trpc.audit.list.useQuery({ dealId });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <p className="text-xs font-medium text-foreground">Activity Log</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Every change is logged with a timestamp and user for compliance purposes.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !log || log.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <History className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-4">
              {log.map((entry) => (
                <div key={entry.id} className="flex gap-3 relative">
                  {/* Dot */}
                  <div className="shrink-0 w-7 h-7 rounded-full bg-background border-2 border-border flex items-center justify-center z-10">
                    <div className="w-2 h-2 rounded-full bg-primary/60" />
                  </div>

                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                          ACTION_COLORS[entry.action] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* Details */}
                    {(entry.fromValue || entry.toValue || entry.metadata) && (
                      <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
                        {entry.fromValue && entry.toValue && (
                          <p>
                            <span className="line-through">{entry.fromValue}</span>
                            {" → "}
                            <span className="font-medium text-foreground">{entry.toValue}</span>
                          </p>
                        )}
                        {!entry.fromValue && entry.toValue && (
                          <p className="font-medium text-foreground">{entry.toValue}</p>
                        )}
                        {entry.metadata && <p className="truncate">{entry.metadata}</p>}
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {entry.userName ?? "Unknown user"} ·{" "}
                      {new Date(entry.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
