import { useAuth } from "@/_core/hooks/useAuth";
import { CRLogo } from "@/components/CRLogo";
import { NewDealModal } from "@/components/NewDealModal";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  ArrowUpDown,
  FilePlus,
  Loader2,
  MessageSquareText,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

// ─── Landing page (unauthenticated) ──────────────────────────────────────────

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="max-w-lg w-full text-center space-y-8">
        <div className="flex items-center justify-center gap-3">
          <CRLogo size={48} />
          <span className="font-sans text-3xl font-bold text-foreground tracking-tight">
            ClosingRoom
          </span>
        </div>
        <div className="space-y-3">
          <h1 className="font-serif text-4xl font-bold text-foreground leading-tight">
            Close deals with confidence.
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            An AI-powered closing checklist platform purpose-built for
            transactional lawyers. Track every condition, document, and
            obligation — from signing to post-closing.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {[
            "Conditions Precedent",
            "Transaction Documents",
            "Post-Closing",
            "Clark AI",
            "Document Upload & AI Extraction",
            "Audit Trail",
            "Closing Memo Generator",
          ].map((f) => (
            <span
              key={f}
              className="px-3 py-1 rounded-full border border-border text-xs font-medium text-muted-foreground bg-card"
            >
              {f}
            </span>
          ))}
        </div>
        <Button
          size="lg"
          className="px-8 font-medium"
          onClick={() => (window.location.href = getLoginUrl())}
        >
          Sign in to get started
        </Button>
        <p className="text-xs text-muted-foreground">
          Secure, professional, and built for the modern deal room.
        </p>
      </div>
    </div>
  );
}

// ─── Health indicator helpers ─────────────────────────────────────────────────

type HealthStatus = "green" | "amber" | "red";

function getDealHealth(
  cpOutstanding: number,
  cpUnderReview: number,
  outstanding: number,
  closingDate: Date | null
): HealthStatus {
  const today = Date.now();
  const daysToClose = closingDate
    ? Math.ceil((closingDate.getTime() - today) / 86400000)
    : null;

  if (cpOutstanding > 0) return "red";
  if (daysToClose !== null && daysToClose <= 14 && outstanding > 0) return "red";
  if (cpUnderReview > 0) return "amber";
  if (daysToClose !== null && daysToClose <= 30 && outstanding > 0) return "amber";
  return "green";
}

const healthConfig: Record<HealthStatus, { dot: string; label: string; badge: string }> = {
  green: {
    dot: "bg-emerald-500",
    label: "On track",
    badge: "bg-emerald-50 border-emerald-200 text-emerald-700",
  },
  amber: {
    dot: "bg-amber-400",
    label: "Attention",
    badge: "bg-amber-50 border-amber-200 text-amber-700",
  },
  red: {
    dot: "bg-rose-500",
    label: "At risk",
    badge: "bg-rose-50 border-rose-200 text-rose-600",
  },
};

function daysUntilClosing(closingDate: Date | null): number | null {
  if (!closingDate) return null;
  return Math.ceil((closingDate.getTime() - Date.now()) / 86400000);
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return "";
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatClosingDate(closingDate: Date | null): string {
  if (!closingDate) return "—";
  return new Date(closingDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Portfolio Dashboard (authenticated) ─────────────────────────────────────

function Dashboard() {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"lastUpdated" | "dealName">("lastUpdated");

  const { data: summaries, isLoading } = trpc.deals.dashboard.useQuery();
  const { data: intakeQueue } = trpc.intake.list.useQuery({ status: "drafted" });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allDeals = summaries ?? [];

  // Client-side search: match deal name, buyer name, or seller name
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? allDeals.filter(
        ({ deal }) =>
          deal.name.toLowerCase().includes(q) ||
          (deal.buyerName ?? "").toLowerCase().includes(q) ||
          (deal.sellerName ?? "").toLowerCase().includes(q)
      )
    : allDeals;
  // Client-side sort
  const deals = [...filtered].sort((a, b) => {
    if (sortBy === "dealName") {
      return a.deal.name.localeCompare(b.deal.name);
    }
    // lastUpdated: most recent first (use lastItemUpdatedAt if available, else deal.createdAt)
    // Values may be strings (JSON serialisation) or Date objects — normalise to ms
    const toMs = (v: Date | string | null | undefined) =>
      v ? new Date(v).getTime() : 0;
    const aTime = toMs(a.lastItemUpdatedAt ?? a.deal.createdAt);
    const bTime = toMs(b.lastItemUpdatedAt ?? b.deal.createdAt);
    return bTime - aTime;
  });

  // Summary counts reflect the filtered set
  const totalDeals = deals.length;


  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-background px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <CRLogo size={32} />
          <span className="font-sans text-xl font-bold text-foreground tracking-tight">
            ClosingRoom
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => (window.location.href = "/intake")}>
            <MessageSquareText className="w-4 h-4 mr-2" />
            Intake review{intakeQueue && intakeQueue.length > 0 ? ` (${intakeQueue.length})` : ""}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <FilePlus className="w-4 h-4 mr-2" />
            New Deal
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">

        {/* ── Page title ───────────────────────────────────────────────── */}
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Deal Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All active transactions</p>
        </div>
        {/* ── Search bar + sort dropdown ────────────────────────────── */}
        <div className="flex gap-3 items-center">
          {/* Search input */}
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals by name…"
              className="w-full pl-12 pr-10 py-3.5 text-base bg-card border-2 border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Sort dropdown */}
          <div className="relative">
            <ArrowUpDown className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "lastUpdated" | "dealName")}
              className="pl-9 pr-8 py-3.5 text-sm bg-card border-2 border-border rounded-xl text-foreground focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm appearance-none cursor-pointer"
            >
              <option value="lastUpdated">Last Updated</option>
              <option value="dealName">Deal Name</option>
            </select>
            <X className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none rotate-45" />
          </div>
        </div>

        {/* ── Summary row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-1 gap-4 max-w-xs">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium mb-1.5">Active Deals</p>
            <p className="font-serif text-3xl font-bold text-foreground">{totalDeals}</p>
          </div>
        </div>

        {/* ── Deal cards ──────────────────────────────────────────────────── */}
        {allDeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center">
              <FilePlus className="w-8 h-8 text-primary/50" />
            </div>
            <div className="space-y-2">
              <h2 className="font-serif text-xl font-bold text-foreground">No deals yet</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Create your first deal to start tracking conditions, documents, and post-closing obligations.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <FilePlus className="w-4 h-4 mr-2" />
              Create your first deal
            </Button>
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Search className="w-8 h-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <h2 className="font-serif text-lg font-bold text-foreground">No deals match your search</h2>
              <p className="text-sm text-muted-foreground">Try a different deal name, buyer, or seller.</p>
            </div>
            <button
              onClick={() => setSearchQuery("")}
              className="text-sm text-primary hover:underline font-medium"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {deals.map(({ deal, total, executed, outstanding, underReview, waived, cpOutstanding, cpUnderReview, progress, lastItemUpdatedAt }) => {
              const closingDate = deal.closingDate ? new Date(deal.closingDate) : null;
              const daysLeft = daysUntilClosing(closingDate);
              const health = getDealHealth(cpOutstanding, cpUnderReview, outstanding, closingDate);
              const hc = healthConfig[health];

              return (
                <button
                  key={deal.id}
                  onClick={() => navigate(`/deal/${deal.id}`)}
                  className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/40 hover:shadow-md transition-all group flex flex-col gap-0"
                >
                  {/* ── Card header: name + health badge ── */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0 flex items-start gap-2">
                      {/* Unread indicator */}
                      {lastItemUpdatedAt && deal.lastViewedAt && new Date(lastItemUpdatedAt).getTime() > new Date(deal.lastViewedAt).getTime() && (
                        <div className="shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                      )}
                      <div className="min-w-0">
                        <h3 className="font-serif text-base font-bold text-foreground leading-snug group-hover:text-primary transition-colors truncate">
                          {deal.name}
                        </h3>
                        {deal.dealStructure && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{deal.dealStructure}</p>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${hc.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${hc.dot}`} />
                      {hc.label}
                    </span>
                  </div>

                  {/* ── Parties row ── */}
                  {(deal.buyerName || deal.sellerName) && (
                    <div className="grid grid-cols-2 gap-x-4 mb-2">
                      {deal.buyerName && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Buyer</p>
                          <p className="text-xs font-medium text-foreground truncate">{deal.buyerName}</p>
                        </div>
                      )}
                      {deal.sellerName && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Seller</p>
                          <p className="text-xs font-medium text-foreground truncate">{deal.sellerName}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {/* ── Counsel row ── */}
                  {(deal.buyerCounsel || deal.sellerCounsel) && (
                    <div className="grid grid-cols-2 gap-x-4 mb-4">
                      {deal.buyerCounsel ? (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Buyer's Counsel</p>
                          <p className="text-xs font-medium text-foreground truncate">{deal.buyerCounsel}</p>
                        </div>
                      ) : <div />}
                      {deal.sellerCounsel ? (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Seller's Counsel</p>
                          <p className="text-xs font-medium text-foreground truncate">{deal.sellerCounsel}</p>
                        </div>
                      ) : <div />}
                    </div>
                  )}

                  {/* ── Deal value + closing date ── */}
                  <div className="grid grid-cols-2 gap-x-4 mb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Deal Value</p>
                      <p className="text-xs font-medium text-foreground">{deal.dealValue || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Target Closing</p>
                      <p className="text-xs font-medium text-foreground">{formatClosingDate(closingDate)}</p>
                    </div>
                  </div>

                  {/* ── Days remaining ── */}
                  {daysLeft !== null && (
                    <div className="mb-4">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Days to Closing</p>
                      <p className={`text-sm font-bold ${daysLeft <= 14 ? "text-rose-600" : daysLeft <= 30 ? "text-amber-600" : "text-foreground"}`}>
                        {daysLeft > 0 ? `${daysLeft} days` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)} days overdue`}
                      </p>
                    </div>
                  )}

                  {/* ── Progress bar ── */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Progress</span>
                      <span className="text-[10px] font-semibold text-foreground">{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* ── Last updated ── */}
                  {lastItemUpdatedAt && (
                    <div className="mb-3">
                      <p className="text-[10px] text-muted-foreground">
                        Last updated: {formatRelativeTime(lastItemUpdatedAt)}
                      </p>
                    </div>
                  )}
                  {/* ── Status breakdown ── */}
                  <div className="pt-3 border-t border-border grid grid-cols-2 gap-y-1.5 gap-x-3">
                    <span className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-medium">{executed} Executed</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-amber-700">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="font-medium">{underReview} Under Review</span>
                    </span>
                    <span className={`flex items-center gap-1.5 text-[11px] ${outstanding > 0 ? "text-rose-700" : "text-muted-foreground"}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${outstanding > 0 ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                      <span className="font-medium">{outstanding} Outstanding</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                      <span className="font-medium">{waived} Waived</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New Deal modal ─────────────────────────────────────────────────── */}
      <NewDealModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(dealId) => navigate(`/deal/${dealId}`)}
      />
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) return <LandingPage />;
  return <Dashboard />;
}
