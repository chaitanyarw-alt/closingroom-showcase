import { useAuth } from "@/_core/hooks/useAuth";
import { ConversationThreadsPanel } from "@/components/ConversationThreadsPanel";
import { ChecklistSection } from "@/components/ChecklistSection";
import { Sidebar } from "@/components/Sidebar";
import { StatsBar } from "@/components/StatsBar";
import { AuditPanel } from "@/components/panels/AuditPanel";
import { DocumentsPanel } from "@/components/panels/DocumentsPanel";
import { MembersPanel } from "@/components/panels/MembersPanel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { SECTION_ORDER, SectionKey } from "@/types";
import {
  ArrowLeft,
  Bot,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  History,
  Loader2,
  Menu,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";

type PanelTab = "chat" | "documents" | "audit" | "members";

const PANEL_TABS: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
  { id: "documents",  label: "Documents",    icon: <FileText  className="w-5 h-5" /> },
  { id: "audit",      label: "Audit Trail",  icon: <History   className="w-5 h-5" /> },
  { id: "members",    label: "Deal Team",    icon: <Users     className="w-5 h-5" /> },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Parse partiesJson into a string array, falling back to legacy single-party fields. */
function getItemParties(item: {
  partiesJson?: string | null;
  party?: string | null;
  partyLabel?: string | null;
  partyCustom?: string | null;
}): string[] {
  if (item.partiesJson) {
    try {
      const parsed = JSON.parse(item.partiesJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    } catch {
      // fall through
    }
  }
  // Legacy fallback: check partyLabel, partyCustom, and old party field
  // Skip "all" and "other" enum values as they are not specific party names
  if (item.partyLabel) return [item.partyLabel];
  if (item.partyCustom) return [item.partyCustom];
  if (item.party && item.party !== "other" && item.party !== "all") return [item.party];
  return [];
}

/** Return true if the item matches the active party filter. */
function itemMatchesFilter(
  item: Parameters<typeof getItemParties>[0],
  activeFilter: string | null
): boolean {
  if (!activeFilter) return true;
  const parties = getItemParties(item);
  // "All Parties" meta-key means every named party — match everything
  if (parties.includes("All Parties")) return true;
  return parties.includes(activeFilter);
}

export default function DealPage() {
  const params = useParams<{ dealId: string }>();
  const dealId = parseInt(params.dealId ?? "0", 10);
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  // Clark modal state
  const [clarkOpen, setClarkOpen] = useState(false);
  // Side panel state (non-chat tabs)
  const [panelOpen, setPanelOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("documents");

  // Clark modal scroll position preservation
  const checklistScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollPos = useRef<number>(0);

  const openClark = useCallback(() => {
    // Save current scroll position before opening Clark
    if (checklistScrollRef.current) {
      savedScrollPos.current = checklistScrollRef.current.scrollTop;
    }
    setClarkOpen(true);
  }, []);

  const closeClark = useCallback(() => {
    setClarkOpen(false);
    // Restore scroll position after closing Clark
    setTimeout(() => {
      if (checklistScrollRef.current) {
        checklistScrollRef.current.scrollTop = savedScrollPos.current;
      }
    }, 0);
  }, []);

  /** Currently active party filter — null means "All" */
  const [partyFilter, setPartyFilter] = useState<string | null>(null);

  /** Currently active status filter — null means show all statuses */
  const [statusFilter, setStatusFilter] = useState<import("@/types").ItemStatus | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.deals.get.useQuery(
    { dealId },
    { enabled: !!dealId && isAuthenticated }
  );

  const markAsViewedMutation = trpc.deals.markAsViewed.useMutation();

  // Optimistic UI: immediately update a checklist item's status in the cache
  // when Clark confirms a status change, then invalidate for eventual consistency.
  const handleStatusChange = useCallback(
    (update: { itemId: number; newStatus: string }) => {
      utils.deals.get.setData({ dealId }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) =>
                i.id === update.itemId
                  ? { ...i, status: update.newStatus as import("@/types").ItemStatus }
                  : i
              ),
            }
          : old
      );
      utils.deals.get.invalidate({ dealId });
    },
    [dealId, utils]
  );

  // Mark deal as viewed on first load
  useEffect(() => {
    if (data?.deal?.id && !data?.deal?.lastViewedAt) {
      markAsViewedMutation.mutate({ dealId: data.deal.id });
    }
  }, [data?.deal?.id, data?.deal?.lastViewedAt, markAsViewedMutation]);

  const deal = data?.deal;
  const items = data?.items ?? [];
  const myRole = data?.myRole ?? null;
  // Extract unique parties from items
  const dealParties = useMemo(() => {
    const parties = new Set<string>();
    items.forEach((item) => {
      getItemParties(item).forEach((p) => parties.add(p));
    });
    return Array.from(parties);
  }, [items]);

  // All unique party names across all items (excluding "All Parties")
  const allPartyNames = useMemo(() => {
    return dealParties.filter((p) => p !== "All Parties").sort();
  }, [dealParties]);

  // Filtered items based on current party and status filters
  const partyFilteredItems = useMemo(
    () => items.filter((i) => itemMatchesFilter(i, partyFilter)),
    [items, partyFilter]
  );

  const filteredItems = useMemo(
    () =>
      partyFilteredItems.filter((i) =>
        statusFilter ? i.status === statusFilter : true
      ),
    [partyFilteredItems, statusFilter]
  );

  const isFiltering = partyFilter !== null || statusFilter !== null;

  // Build a map of section → filteredItems so the checklist respects both party and status filters
  const itemsBySection = useMemo(() => {
    const map: Record<SectionKey, typeof items> = {
      conditions_precedent: [],
      transaction_documents: [],
      post_closing: [],
    };
    filteredItems.forEach((item) => {
      const section = item.section as SectionKey;
      if (section in map) map[section].push(item);
    });
    return map;
  }, [filteredItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Please log in to continue.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Failed to load deal.</p>
          <Button onClick={() => navigate("/")}>Back to Portfolio</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar activeDealId={dealId} onSelectDeal={(id) => navigate(`/deal/${id}`)} items={items} mobileOpen={mobileSidebarOpen} onCloseMobile={() => setMobileSidebarOpen(false)} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-background px-6 py-3 shrink-0">
          <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="Open deal navigation"
                aria-label="Open deal navigation"
              >
                <Menu className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate("/")}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="Back to portfolio"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-foreground">{deal?.name}</h1>
                {deal?.closingDate && (
                  <p className="text-xs text-muted-foreground">
                    Target closing:{" "}
                    {new Date(deal.closingDate).toLocaleDateString("en-GB", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Clark modal toggle */}
              <button
                onClick={() => openClark()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors shrink-0 ${
                  clarkOpen
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                Clark
              </button>
              {/* Side panel toggle */}
              <button
                onClick={() => setPanelOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-accent transition-colors shrink-0"
              >
                {panelOpen ? "Hide Panel" : "Panels"}
                {panelOpen ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronLeft className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
          <StatsBar
            items={items}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </div>

        {/* Clark full-screen modal overlay */}
        {clarkOpen && (
          <div className="fixed inset-0 z-50 bg-black/20 flex flex-col">
            {/* Modal header with close button */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Clark</h2>
              </div>
              <button
                onClick={() => closeClark()}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Close Clark and return to checklist"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Checklist
              </button>
            </div>
            {/* Chat content — full width */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ConversationThreadsPanel dealId={dealId} dealName={deal?.name || "Deal"} height="100%" className="h-full" onStatusChange={handleStatusChange} />
            </div>
          </div>
        )}

        {/* Checklist + right panel */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Checklist — always full width when side panel is closed */}
          <div ref={checklistScrollRef} className="flex-1 overflow-y-auto">

            {/* ── Party filter bar ─────────────────────────────────────────── */}
            {allPartyNames.length > 0 && (
              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border bg-muted/30 flex-wrap">
                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground font-medium shrink-0">Filter by party:</span>
                {/* All pill */}
                <button
                  onClick={() => setPartyFilter(null)}
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    !isFiltering
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  All
                </button>
                {/* One pill per unique party */}
                {allPartyNames.map((party) => (
                  <button
                    key={party}
                    onClick={() => setPartyFilter(partyFilter === party ? null : party)}
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                      partyFilter === party
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {party}
                    {partyFilter === party && (
                      <X className="w-3 h-3 ml-0.5 opacity-70" />
                    )}
                  </button>
                ))}
                {/* Clear all filters — visible whenever either party or status filter is active */}
                {isFiltering && (
                  <button
                    onClick={() => { setPartyFilter(null); setStatusFilter(null); }}
                    className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors"
                    title="Clear all filters"
                  >
                    <X className="w-3 h-3" />
                    Clear all filters
                  </button>
                )}
              </div>
            )}
            {/* ── Filter summary banner ─────────────────────────────────────────── */}
            {isFiltering && (
              <div className="flex items-center gap-2 px-5 py-2 bg-primary/5 border-b border-primary/20 text-xs text-muted-foreground">
                <Filter className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="font-medium text-foreground">Showing:</span>
                {statusFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                    {statusFilter}
                  </span>
                )}
                {statusFilter && partyFilter && <span className="text-muted-foreground">assigned to</span>}
                {partyFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                    {partyFilter}
                  </span>
                )}
                <span className="text-muted-foreground">
                  &mdash; {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
                </span>
                <button
                  onClick={() => { setPartyFilter(null); setStatusFilter(null); }}
                  className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors"
                  title="Clear all filters"
                >
                  <X className="w-3 h-3" />
                  Clear all filters
                </button>
              </div>
            )}

            {/* ── Checklist sections ────────────────────────────────────────────────── */}
            <div className="divide-y divide-border">
              {SECTION_ORDER.map((section) => {
                const sectionItems = itemsBySection[section];
                // When filtering, hide sections that have no matching items
                // (but still show them when adding new items is possible — we
                //  always show the section so the user can add items)
                if (isFiltering && sectionItems.length === 0) {
                  return null;
                }
                return (
                  <ChecklistSection
                    key={section}
                    section={section}
                    items={sectionItems}
                    dealId={dealId}
                    myRole={myRole}
                    dealParties={{
                      buyerName: deal?.buyerName ?? null,
                      sellerName: deal?.sellerName ?? null,
                      buyerCounsel: deal?.buyerCounsel ?? null,
                      sellerCounsel: deal?.sellerCounsel ?? null,
                    }}
                  />
                );
              })}

              {/* No results message when filter is active and nothing matches */}
              {isFiltering && filteredItems.length === 0 && (
                <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {statusFilter && partyFilter
                      ? <>No <span className="font-medium text-foreground">{statusFilter}</span> items assigned to <span className="font-medium text-foreground">{partyFilter}</span>.</>
                      : statusFilter
                      ? <>No <span className="font-medium text-foreground">{statusFilter}</span> items found.</>
                      : <>No items assigned to <span className="font-medium text-foreground">{partyFilter}</span>.</>
                    }
                  </p>
                  <button
                    onClick={() => { setPartyFilter(null); setStatusFilter(null); }}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right panel — vertical icon nav + content */}
          {panelOpen && (
            <div className="flex shrink-0 border-l border-border bg-background overflow-hidden">
              {/* Vertical icon sidebar */}
              <div className="w-12 shrink-0 flex flex-col items-center py-3 gap-1 border-r border-border bg-muted/20">
                {PANEL_TABS.map((tab) => (
                  <Tooltip key={tab.id} delayDuration={150}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                          activeTab === tab.id
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                        aria-label={tab.label}
                      >
                        {tab.icon}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs font-medium">
                      {tab.label}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Panel content */}
              <div className="w-80 flex flex-col overflow-hidden">
                {activeTab === "documents"  && <DocumentsPanel  dealId={dealId} items={items} />}
                {activeTab === "audit"      && <AuditPanel      dealId={dealId} />}
                {activeTab === "members"    && <MembersPanel    dealId={dealId} />}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
