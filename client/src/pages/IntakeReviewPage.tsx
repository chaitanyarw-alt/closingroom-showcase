import { ArrowLeft, Check, ExternalLink, Loader2, MessageSquareText, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { CRLogo } from "@/components/CRLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string) {
  return status === "drafted" ? "Awaiting review" : status.charAt(0).toUpperCase() + status.slice(1);
}

type IntakeResponseReviewProps = {
  intake: {
    id: number;
    status: string;
    response: string | null;
    reviewerNotes: string | null;
    aiDraft: string | null;
    approvedResponse: string | null;
  };
  canAct: boolean;
  isBusy: boolean;
  isPosting: boolean;
  approvalMessage?: string;
  approvalError?: string;
  onApprove: (response: string, reviewNote: string) => void;
  onReject: (reviewNote: string) => void;
};

function IntakeResponseReview({ intake, canAct, isBusy, isPosting, approvalMessage, approvalError, onApprove, onReject }: IntakeResponseReviewProps) {
  // The parent keys this component by intake ID so neither editor can cross intakes.
  const [response, setResponse] = useState(intake.response ?? "");
  const [reviewNote, setReviewNote] = useState("");
  const responseInitialized = useRef(intake.response != null);
  const responseEdited = useRef(false);

  useEffect(() => {
    // A draft may arrive after the intake. Seed it once, but never replace an
    // edit (including a deliberately emptied editor) during a refetch.
    if (!responseInitialized.current && intake.response != null) {
      responseInitialized.current = true;
      if (!responseEdited.current) setResponse(intake.response);
    }
  }, [intake.response]);

  const hasLegacyDraft = intake.status !== "posted" && intake.response == null && Boolean(intake.aiDraft?.trim());
  const hasPreviouslySentResponse = intake.status === "posted" && intake.response == null && Boolean(intake.approvedResponse?.trim());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Business-facing response</CardTitle><CardDescription>Only this response is posted to the business after approval. Keep internal guidance out of this editor.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor={`business-response-${intake.id}`} className="text-sm font-medium">Business-facing response</label>
            <Textarea id={`business-response-${intake.id}`} value={response} onChange={(e) => { responseEdited.current = true; setResponse(e.target.value); }} disabled={!canAct || isBusy} className="min-h-[230px] leading-6" placeholder="Compose the response to send to the business" />
          </div>
          <div className="space-y-2">
            <label htmlFor={`human-review-note-${intake.id}`} className="text-sm font-medium">Internal human review note (optional)</label>
            <p className="text-xs text-muted-foreground">Your review note is separate from Clark’s lawyer-only guidance and is never posted to the business.</p>
            <Textarea id={`human-review-note-${intake.id}`} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} disabled={!canAct || isBusy} className="min-h-[90px]" placeholder="Record your internal review note" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Approved business-facing responses post to the originating Slack channel or thread.</p><div className="flex gap-2"><Button variant="outline" disabled={!canAct || isBusy} onClick={() => onReject(reviewNote)}><X className="w-4 h-4 mr-2" /> Reject</Button><Button disabled={!canAct || isBusy || !response.trim()} onClick={() => onApprove(response.trim(), reviewNote)}><Check className="w-4 h-4 mr-2" /> {isPosting ? "Posting…" : "Approve & post"}</Button></div></div>
          {approvalMessage && <p className="text-sm text-emerald-700">{approvalMessage}</p>}
          {approvalError && <p className="text-sm text-destructive">{approvalError}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Lawyer-only guidance</CardTitle><CardDescription>Never posted to the business</CardDescription></CardHeader>
        <CardContent><p className="text-sm leading-7 whitespace-pre-wrap">{intake.reviewerNotes || "No lawyer-only guidance recorded."}</p></CardContent>
      </Card>
      {hasLegacyDraft && (
        <Card>
          <CardHeader><CardTitle className="text-base">Legacy draft — lawyer review required</CardTitle><CardDescription>This read-only mixed draft may include internal guidance. Compose a business-facing response in the blank editor above; do not post this legacy draft as-is.</CardDescription></CardHeader>
          <CardContent><p className="text-sm leading-7 whitespace-pre-wrap">{intake.aiDraft}</p></CardContent>
        </Card>
      )}
      {hasPreviouslySentResponse && (
        <Card>
          <CardHeader><CardTitle className="text-base">Previously sent business response</CardTitle><CardDescription>Read-only historical record of the response already posted to Slack.</CardDescription></CardHeader>
          <CardContent><p className="text-sm leading-7 whitespace-pre-wrap">{intake.approvedResponse}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

export default function IntakeReviewPage() {
  const [, routeParams] = useRoute("/intake/:intakeId");
  const [, navigate] = useLocation();
  const intakeId = routeParams?.intakeId ? Number(routeParams.intakeId) : null;
  const { isAuthenticated, loading: authLoading } = useAuth();
  const queueQuery = trpc.intake.list.useQuery(undefined, { enabled: isAuthenticated && intakeId === null });
  const detailQuery = trpc.intake.get.useQuery({ intakeId: intakeId ?? 0 }, { enabled: isAuthenticated && intakeId !== null });
  const utils = trpc.useUtils();
  const approve = trpc.intake.approve.useMutation({
    onSuccess: () => { void utils.intake.invalidate(); },
  });
  const reject = trpc.intake.reject.useMutation({
    onSuccess: () => { void utils.intake.invalidate(); navigate("/intake"); },
  });
  const linkDeal = trpc.intake.linkDeal.useMutation({
    onSuccess: () => { void utils.intake.invalidate(); void detailQuery.refetch(); },
  });
  const dealsQuery = trpc.deals.list.useQuery(undefined, { enabled: isAuthenticated && intakeId !== null });
  const [selectedDealId, setSelectedDealId] = useState("");

  useEffect(() => {
    const intake = detailQuery.data?.intake;
    setSelectedDealId(intake?.id === intakeId && intake.dealId ? String(intake.dealId) : "");
  }, [intakeId, detailQuery.data?.intake.id, detailQuery.data?.intake.dealId]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!isAuthenticated) return <div className="min-h-screen bg-background flex items-center justify-center px-6"><Card className="max-w-md w-full"><CardHeader className="text-center"><div className="flex justify-center mb-2"><CRLogo size={40} /></div><CardTitle>Sign in to review this intake</CardTitle><CardDescription>ClosingRoom keeps Slack drafts private until an authorised lawyer signs in.</CardDescription></CardHeader><CardContent><Button className="w-full" onClick={() => (window.location.href = getLoginUrl(window.location.pathname))}>Sign in with Manus</Button></CardContent></Card></div>;

  if (intakeId === null) {
    const intakes = queueQuery.data ?? [];
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-background px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3"><CRLogo size={32} /><span className="font-sans text-xl font-bold text-foreground">ClosingRoom</span></Link>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">Back to portfolio</Link>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
          <div><p className="text-xs uppercase tracking-[0.18em] text-primary font-semibold">Slack intake</p><h1 className="font-serif text-3xl font-bold mt-2">Lawyer review queue</h1><p className="text-muted-foreground mt-2">Review Clark’s proposed responses before anything is posted back to Slack.</p></div>
          {queueQuery.isLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : intakes.length === 0 ? (
            <Card><CardContent className="py-14 text-center"><MessageSquareText className="w-8 h-8 mx-auto text-muted-foreground mb-3" /><p className="font-medium">No intake requests yet</p><p className="text-sm text-muted-foreground mt-1">Use the ClosingRoom Slack command to send a business query for review.</p></CardContent></Card>
          ) : (
            <div className="grid gap-4">{intakes.map((intake) => <Link key={intake.id} href={`/intake/${intake.id}`}><Card className="hover:border-primary/50 transition-colors cursor-pointer"><CardContent className="p-5 flex items-start justify-between gap-5"><div className="min-w-0"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{statusLabel(intake.status)}</span><span>{intake.dealName ?? "Deal needs assignment"}</span><span>·</span><span>{formatDate(intake.createdAt)}</span></div><p className="mt-3 text-sm font-medium text-foreground line-clamp-2">{intake.question}</p></div><ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" /></CardContent></Card></Link>)}</div>
          )}
        </main>
      </div>
    );
  }

  if (detailQuery.isLoading || !detailQuery.data || detailQuery.data.intake.id !== intakeId) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  const { intake, deal } = detailQuery.data;
  const canAct = intake.status !== "posted" && intake.status !== "rejected";
  const isBusy = approve.isPending || reject.isPending || linkDeal.isPending;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-8 py-4 flex items-center justify-between"><Link href="/" className="flex items-center gap-3"><CRLogo size={32} /><span className="font-sans text-xl font-bold text-foreground">ClosingRoom</span></Link><Link href="/intake" className="text-sm text-muted-foreground hover:text-foreground">Review queue</Link></header>
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        <button onClick={() => navigate("/intake")} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back to queue</button>
        <div><p className="text-xs uppercase tracking-[0.18em] text-primary font-semibold">Intake #{intake.id} · {statusLabel(intake.status)}</p><h1 className="font-serif text-3xl font-bold mt-2">Review proposed response</h1><p className="text-muted-foreground mt-2">Nothing is posted to Slack until a lawyer approves the response below.</p></div>
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <Card><CardHeader><CardTitle className="text-base">Business query</CardTitle><CardDescription>Submitted by {intake.requesterName || "Slack user"} on {formatDate(intake.createdAt)}</CardDescription></CardHeader><CardContent><p className="text-sm leading-7 whitespace-pre-wrap">{intake.question}</p><div className="mt-6 pt-5 border-t border-border"><label className="text-sm font-medium">Deal association</label>{deal ? <p className="text-sm text-muted-foreground mt-2">{deal.name}</p> : <div className="flex gap-2 mt-2"><select value={selectedDealId} onChange={(e) => setSelectedDealId(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Select a deal…</option>{(dealsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button size="sm" variant="outline" disabled={!selectedDealId || isBusy} onClick={() => linkDeal.mutate({ intakeId: intake.id, dealId: Number(selectedDealId) })}>Link</Button></div>}</div></CardContent></Card>
          <IntakeResponseReview key={intake.id} intake={intake} canAct={canAct} isBusy={isBusy} isPosting={approve.isPending} onApprove={(response, reviewNote) => approve.mutate({ intakeId: intake.id, response, reviewNote })} onReject={(reviewNote) => reject.mutate({ intakeId: intake.id, reviewNote })} approvalMessage={approve.isSuccess ? `Approved. ${approve.data.posted ? "The response was posted to Slack." : "Approval was saved, but Slack posting needs a retry."}` : undefined} approvalError={approve.isError ? approve.error.message : undefined} />
        </div>
      </main>
    </div>
  );
}
