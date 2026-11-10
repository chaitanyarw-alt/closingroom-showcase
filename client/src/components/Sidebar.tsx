import { CRLogo } from "@/components/CRLogo";
import { NewDealModal } from "@/components/NewDealModal";
import { trpc } from "@/lib/trpc";
import { SECTION_LABELS, SECTION_ORDER, SectionKey, STATUS_DOT, ItemStatus } from "@/types";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  FilePlus,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";

interface SidebarProps {
  activeDealId: number | null;
  onSelectDeal: (id: number) => void;
  items: Array<{ section: string; status: string }>;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ activeDealId, onSelectDeal, items, mobileOpen = false, onCloseMobile }: SidebarProps) {
  const utils = trpc.useUtils();
  const { data: deals, isLoading } = trpc.deals.list.useQuery();

  // New Deal modal (shared two-step form)
  const [createOpen, setCreateOpen] = useState(false);

  const deleteDeal = trpc.deals.delete.useMutation({
    onSuccess: () => {
      utils.deals.list.invalidate();
      toast.success("Deal deleted");
    },
    onError: () => toast.error("Failed to delete deal"),
  });

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const renameDeal = trpc.deals.update.useMutation({
    onSuccess: () => {
      utils.deals.list.invalidate();
      setRenamingId(null);
      toast.success("Deal renamed");
    },
    onError: () => toast.error("Failed to rename deal"),
  });

  const activeDeal = deals?.find((d) => d.id === activeDealId);

  // Alerts summary
  const { data: alertSummary } = trpc.alerts.getOverdueSummary.useQuery(
    { dealId: activeDealId! },
    { enabled: !!activeDealId, refetchInterval: 60_000 }
  );

  const checkAlerts = trpc.alerts.checkOverdue.useMutation({
    onSuccess: (data) => {
      if (data.overdueCount === 0 && data.approachingCount === 0 && !data.dealClosingOverdue) {
        toast.success("No overdue or approaching deadlines — all clear!");
      } else {
        toast.warning(`Alert sent: ${data.overdueCount} overdue, ${data.approachingCount} approaching`);
      }
    },
    onError: () => toast.error("Failed to check alerts"),
  });

  // Progress calculation
  const total = items.length;
  const executed = items.filter((i) => i.status === "Executed").length;
  const waived = items.filter((i) => i.status === "Waived").length;
  const progressPct = total > 0 ? Math.round(((executed + waived) / total) * 100) : 0;

  // Items per section for nav badges
  const sectionCounts = SECTION_ORDER.reduce<Record<SectionKey, { total: number; executed: number }>>((acc, s) => {
    const sItems = items.filter((i) => i.section === s);
    acc[s] = {
      total: sItems.length,
      executed: sItems.filter((i) => i.status === "Executed" || i.status === "Waived").length,
    };
    return acc;
  }, {} as Record<SectionKey, { total: number; executed: number }>);

  const handleScrollTo = (section: SectionKey) => {
    const el = document.getElementById(`section-${section}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {mobileOpen && <button aria-label="Close navigation" onClick={onCloseMobile} className="fixed inset-0 z-30 bg-black/30 md:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 flex flex-col h-screen bg-[var(--sidebar)] text-[var(--sidebar-foreground)] border-r border-[var(--sidebar-border)] transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      {/* Logo / Brand */}
      <div className="px-5 py-5 border-b border-[var(--sidebar-border)]">
        <div className="flex items-center gap-2.5">
          <CRLogo size={28} className="shrink-0" />
          <span className="font-sans text-lg font-bold tracking-tight text-[var(--sidebar-primary)]">
            ClosingRoom
          </span>
        </div>
        <p className="text-xs text-[var(--sidebar-foreground)]/50 mt-1 ml-7">
          Deal Closing Management
        </p>
      </div>

      {/* Deal Switcher */}
      <div className="px-4 py-4 border-b border-[var(--sidebar-border)]">
        <p className="text-[10px] uppercase tracking-widest text-[var(--sidebar-foreground)]/40 mb-2 font-medium">
          Active Deal
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-[var(--sidebar-accent)] hover:bg-[var(--sidebar-accent)]/80 transition-colors text-left">
              <span className="text-sm font-medium text-[var(--sidebar-accent-foreground)] truncate">
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                ) : activeDeal ? (
                  activeDeal.name
                ) : (
                  <span className="text-[var(--sidebar-foreground)]/40 italic">Select a deal…</span>
                )}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--sidebar-foreground)]/50 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            {deals?.map((deal) => (
              <DropdownMenuItem
                key={deal.id}
                className="flex items-center justify-between group"
                onSelect={() => { onSelectDeal(deal.id); onCloseMobile?.(); }}
              >
                <span className={deal.id === activeDealId ? "font-semibold" : ""}>{deal.name}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="p-0.5 rounded hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(deal.id);
                      setRenameValue(deal.name);
                    }}
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    className="p-0.5 rounded hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${deal.name}"? This cannot be undone.`)) {
                        deleteDeal.mutate({ dealId: deal.id });
                        if (deal.id === activeDealId && deals.length > 1) {
                          const next = deals.find((d) => d.id !== deal.id);
                          if (next) { onSelectDeal(next.id); onCloseMobile?.(); }
                        }
                      }
                    }}
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </DropdownMenuItem>
            ))}
            {deals && deals.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <FilePlus className="w-3.5 h-3.5 mr-2" />
              New Deal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress */}
      {activeDeal && (
        <div className="px-4 py-4 border-b border-[var(--sidebar-border)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-[var(--sidebar-foreground)]/40 font-medium">
              Overall Progress
            </p>
            <span className="text-xs font-semibold text-[var(--sidebar-primary)]">
              {progressPct}%
            </span>
          </div>
          <Progress
            value={progressPct}
            className="h-1.5 bg-[var(--sidebar-border)]"
          />
          <p className="text-[11px] text-[var(--sidebar-foreground)]/40 mt-1.5">
            {executed + waived} of {total} items resolved
          </p>
        </div>
      )}

      {/* Alert Banner */}
      {activeDeal && alertSummary && (alertSummary.overdueCount > 0 || alertSummary.approachingCount > 0 || alertSummary.dealClosingOverdue) && (
        <div className="mx-3 mb-1 px-3 py-2 rounded-md bg-rose-500/10 border border-rose-400/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {alertSummary.dealClosingOverdue && (
                <p className="text-[10px] text-rose-500 font-medium">Closing date passed</p>
              )}
              {alertSummary.daysToClosing !== null && alertSummary.daysToClosing >= 0 && alertSummary.daysToClosing <= 3 && !alertSummary.dealClosingOverdue && (
                <p className="text-[10px] text-amber-500 font-medium">Closing in {alertSummary.daysToClosing}d</p>
              )}
              {alertSummary.overdueCount > 0 && (
                <p className="text-[10px] text-rose-400">{alertSummary.overdueCount} overdue item{alertSummary.overdueCount > 1 ? "s" : ""}</p>
              )}
              {alertSummary.approachingCount > 0 && (
                <p className="text-[10px] text-amber-400">{alertSummary.approachingCount} due soon</p>
              )}
            </div>
            <button
              onClick={() => activeDealId && checkAlerts.mutate({ dealId: activeDealId })}
              disabled={checkAlerts.isPending}
              className="shrink-0 p-0.5 rounded hover:bg-rose-500/20 transition-colors"
              title="Send alert notification"
            >
              {checkAlerts.isPending ? <Loader2 className="w-3 h-3 animate-spin text-rose-400" /> : <Bell className="w-3 h-3 text-rose-400" />}
            </button>
          </div>
        </div>
      )}

      {/* Section Navigation */}
      {activeDeal && (
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-widest text-[var(--sidebar-foreground)]/40 font-medium px-2 mb-3">
            Sections
          </p>
          <ul className="space-y-1">
            {SECTION_ORDER.map((section) => {
              const counts = sectionCounts[section];
              const pct = counts.total > 0 ? Math.round((counts.executed / counts.total) * 100) : 0;
              return (
                <li key={section}>
                  <button
                    onClick={() => handleScrollTo(section)}
                    className="w-full flex items-start gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--sidebar-accent)] transition-colors text-left group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--sidebar-accent-foreground)] leading-tight">
                        {SECTION_LABELS[section]}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 bg-[var(--sidebar-border)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--sidebar-primary)]/60 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--sidebar-foreground)]/40 shrink-0">
                          {counts.executed}/{counts.total}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {/* Status Legend */}
      <div className="px-4 py-4 border-t border-[var(--sidebar-border)]">
        <p className="text-[10px] uppercase tracking-widest text-[var(--sidebar-foreground)]/40 font-medium mb-2">
          Status Legend
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {(["Executed", "Under Review", "Outstanding", "Waived"] as ItemStatus[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
              <span className="text-[11px] text-[var(--sidebar-foreground)]/60">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rename Deal Dialog */}
      <Dialog open={renamingId !== null} onOpenChange={(open) => { if (!open) setRenamingId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Rename Deal</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rename-deal">Deal Name *</Label>
              <Input
                id="rename-deal"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim() && renamingId) {
                    renameDeal.mutate({ dealId: renamingId, name: renameValue.trim() });
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingId(null)}>Cancel</Button>
            <Button
              disabled={!renameValue.trim() || renameDeal.isPending}
              onClick={() => renamingId && renameDeal.mutate({ dealId: renamingId, name: renameValue.trim() })}
            >
              {renameDeal.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared two-step New Deal modal */}
      <NewDealModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(dealId) => onSelectDeal(dealId)}
      />
      </aside>
    </>
  );
}
