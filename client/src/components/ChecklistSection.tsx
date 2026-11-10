import { trpc } from "@/lib/trpc";
import {
  ItemStatus,
  SECTION_LABELS,
  SectionKey,
  STATUS_CLASSES,
  STATUS_DOT,
  STATUS_OPTIONS,
} from "@/types";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PartyMultiSelect } from "./PartyMultiSelect";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

// ─── Party helpers ─────────────────────────────────────────────────────────────

export interface DealParties {
  buyerName: string | null;
  sellerName: string | null;
  buyerCounsel: string | null;
  sellerCounsel: string | null;
}

/**
 * Parse partiesJson (JSON array string) into a string array.
 * Falls back to resolving the legacy single-party fields for backward compat.
 */
function parseParties(
  partiesJson: string | null | undefined,
  party: string | null | undefined,
  partyLabel: string | null | undefined,
  partyCustom: string | null | undefined,
  dealParties: DealParties
): string[] {
  if (partiesJson) {
    try {
      const parsed = JSON.parse(partiesJson);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // fall through to legacy
    }
  }
  // Legacy single-party fallback
  const label = resolveLegacyPartyLabel(party, partyLabel, partyCustom, dealParties);
  return label ? [label] : [];
}

function resolveLegacyPartyLabel(
  party: string | null | undefined,
  partyLabel: string | null | undefined,
  partyCustom: string | null | undefined,
  parties: DealParties
): string | null {
  if (!party || party === "all") return null;
  if (party === "other") return partyCustom ?? "Other";
  if (partyLabel) return partyLabel;
  if (party === "buyer_counsel" && parties.buyerCounsel) return parties.buyerCounsel;
  if (party === "seller_counsel" && parties.sellerCounsel) return parties.sellerCounsel;
  if (party === "buyer" && parties.buyerName) return parties.buyerName;
  if (party === "seller" && parties.sellerName) return parties.sellerName;
  if (party === "bank") return "Bank / Lender";
  return null;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: number;
  dealId: number;
  section: string;
  title: string;
  status: string;
  notes: string | null;
  sortOrder: number;
  deadline?: Date | string | null;
  assigneeUserId?: number | null;
  party?: string | null;
  partyLabel?: string | null;
  partyCustom?: string | null;
  partiesJson?: string | null;
  statusChangedAt?: number | null;
}

type DealRole = "owner" | "admin" | "editor" | "viewer" | null;

interface ChecklistSectionProps {
  section: SectionKey;
  items: ChecklistItem[];
  dealId: number;
  dealParties: DealParties;
  myRole?: DealRole;
}

// ─── Deadline helpers ──────────────────────────────────────────────────────────

function formatDeadline(deadline: Date | string | null | undefined): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(deadline: Date | string | null | undefined, status: string): boolean {
  if (!deadline || status === "Executed" || status === "Waived") return false;
  return new Date(deadline) < new Date();
}

function isApproaching(deadline: Date | string | null | undefined, status: string): boolean {
  if (!deadline || status === "Executed" || status === "Waived") return false;
  const daysUntil = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntil >= 0 && daysUntil <= 3;
}

// ─── Item Row ──────────────────────────────────────────────────────────────────

type ItemDoc = { id: number; filename: string; storageKey: string; previewUrl: string };
function ItemRow({
  item,
  dealId,
  dealParties,
  itemDocs,
  onDocUploaded,
  myRole,
}: {
  item: ChecklistItem;
  dealId: number;
  dealParties: DealParties;
  itemDocs: ItemDoc[];
  onDocUploaded: () => void;
  myRole?: DealRole;
}) {
  const isViewer = myRole === "viewer";
  const isEditorOrBelow = myRole === "viewer" || myRole === "editor";
  const utils = trpc.useUtils();
  // Document preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ItemDoc | null>(null);
  // Per-item document upload
  const [uploading, setUploading] = useState(false);
  // Unlink document from item
  const [unlinking, setUnlinking] = useState(false);
  const linkToItem = trpc.documents.linkToItem.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate({ dealId });
      onDocUploaded();
      setUnlinking(false);
    },
    onError: () => { toast.error("Failed to remove attachment"); setUnlinking(false); },
  });
  const handleDownload = async (storageKey: string, filename: string) => {
    // Fetch through the server-side proxy which streams bytes directly.
    // The proxy fetches from CloudFront server-side (same IP that requested the presign)
    // and pipes the bytes to the browser — the browser never touches CloudFront.
    try {
      const resp = await fetch(`/api/download/${storageKey}`, { credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Use clean filename (strip timestamp prefix)
      const cleanName = filename.replace(/^\d+-/, "");
      a.download = cleanName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      toast.error("Failed to download document");
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const getUploadUrl = trpc.documents.getUploadUrl.useMutation();
  const confirmUpload = trpc.documents.confirmUpload.useMutation();
  const handleItemUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB"); return; }
    setUploading(true);
    try {
      const { docId, key } = await getUploadUrl.mutateAsync({ dealId, filename: file.name, mimeType: file.type || "application/pdf", sizeBytes: file.size, checklistItemId: item.id });
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await confirmUpload.mutateAsync({ docId, dealId, storageKey: key, fileContent: base64, filename: file.name });
      onDocUploaded();
      toast.success("Document attached and analysed by Clark");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  // Notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesValue, setNotesValue] = useState(item.notes ?? "");

  // Optimistic status + timestamp
  const [optimisticStatus, setOptimisticStatus] = useState<ItemStatus>(item.status as ItemStatus);
  const [optimisticStatusChangedAt, setOptimisticStatusChangedAt] = useState<number | null>(item.statusChangedAt ?? null);

  // Inline title edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(item.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Multi-select party state
  const [editingParty, setEditingParty] = useState(false);
  const [selectedParties, setSelectedParties] = useState<string[]>(() =>
    parseParties(item.partiesJson, item.party, item.partyLabel, item.partyCustom, dealParties)
  );

  // Keep selectedParties in sync when item data changes (e.g. after invalidate)
  useEffect(() => {
    setSelectedParties(
      parseParties(item.partiesJson, item.party, item.partyLabel, item.partyCustom, dealParties)
    );
  }, [item.partiesJson, item.party, item.partyLabel, item.partyCustom]);


  const invalidate = () => utils.deals.get.invalidate({ dealId });

  const updateStatus = trpc.items.updateStatus.useMutation({
    onMutate: ({ status }) => {
      setOptimisticStatus(status);
      setOptimisticStatusChangedAt(Date.now());
    },
    onSuccess: invalidate,
    onError: () => {
      setOptimisticStatus(item.status as ItemStatus);
      setOptimisticStatusChangedAt(item.statusChangedAt ?? null);
      toast.error("Failed to update status");
    },
  });

  const updateTitle = trpc.items.updateTitle.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingTitle(false);
      toast.success("Item renamed");
    },
    onError: () => {
      setTitleValue(item.title);
      setEditingTitle(false);
      toast.error("Failed to rename item");
    },
  });

  const updateParty = trpc.items.updateParty.useMutation({
    onSuccess: () => {
      invalidate();
      setEditingParty(false);
      toast.success("Party updated");
    },
    onError: () => {
      setSelectedParties(
        parseParties(item.partiesJson, item.party, item.partyLabel, item.partyCustom, dealParties)
      );
      setEditingParty(false);
      toast.error("Failed to update party");
    },
  });

  const deleteItem = trpc.items.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Item removed");
    },
    onError: () => toast.error("Failed to remove item"),
  });


  const updateNotes = trpc.items.updateNotes.useMutation({
    onSuccess: () => {
      invalidate();
      setNotesOpen(false);
      toast.success("Notes saved");
    },
    onError: () => toast.error("Failed to save notes"),
  });

  const handleStatusChange = (val: string) => {
    const status = val as ItemStatus;
    updateStatus.mutate({ itemId: item.id, dealId, status });
  };

  const handleTitleEdit = () => {
    setTitleValue(item.title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 30);
  };

  const handleTitleSave = () => {
    const trimmed = titleValue.trim();
    if (!trimmed) { setTitleValue(item.title); setEditingTitle(false); return; }
    if (trimmed === item.title) { setEditingTitle(false); return; }
    updateTitle.mutate({ itemId: item.id, dealId, title: trimmed });
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleTitleSave();
    if (e.key === "Escape") { setTitleValue(item.title); setEditingTitle(false); }
  };

  const handlePartyChange = (parties: string[]) => {
    setSelectedParties(parties);
    updateParty.mutate({
      itemId: item.id,
      dealId,
      partiesJson: JSON.stringify(parties),
    });
  };


  const isExecuted = optimisticStatus === "Executed";
  const isWaived = optimisticStatus === "Waived";
  const isDimmed = isExecuted || isWaived;
  const overdue = isOverdue(item.deadline, optimisticStatus);
  const approaching = isApproaching(item.deadline, optimisticStatus);
  const deadlineLabel = formatDeadline(item.deadline);

  // Display parties — filter out the "All Parties" meta-key for badge display
  const displayParties = selectedParties.filter((p) => p !== "All Parties");
  const isAllParties = selectedParties.includes("All Parties");

  return (
    <>
      <div
        className={`group border-b border-border last:border-0 transition-colors ${
          overdue ? "bg-rose-50/40" : isDimmed ? "bg-muted/30" : "hover:bg-accent/30"
        }`}
      >
        <div className="flex items-start gap-3 px-5 py-3.5">
          {/* Status icon */}
          <div className="shrink-0 mt-0.5">
            {isExecuted ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : overdue ? (
              <AlertCircle className="w-4 h-4 text-rose-500" />
            ) : (
              <Circle
                className={`w-4 h-4 ${
                  optimisticStatus === "Outstanding"
                    ? "text-rose-400"
                    : optimisticStatus === "Waived"
                    ? "text-slate-300"
                    : "text-amber-400"
                }`}
              />
            )}
          </div>

          {/* Title + badges */}
          <div className="flex-1 min-w-0">
            {editingTitle && !isEditorOrBelow ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={titleInputRef}
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={handleTitleKeyDown}
                  className="h-7 text-sm py-0 px-2 flex-1"
                  disabled={updateTitle.isPending}
                />
                <button
                  onClick={handleTitleSave}
                  className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  title="Save"
                >
                  {updateTitle.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                </button>
                <button
                  onClick={() => { setTitleValue(item.title); setEditingTitle(false); }}
                  className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/title">
                <div>
                  <p
                    className={`text-sm leading-snug ${isEditorOrBelow ? "" : "cursor-pointer hover:underline decoration-dashed underline-offset-2"} ${
                      isDimmed ? "text-muted-foreground" : "text-foreground"
                    }`}
                    onClick={isEditorOrBelow ? undefined : handleTitleEdit}
                    title={isEditorOrBelow ? undefined : "Click to edit"}
                  >
                    {item.title}
                  </p>
                  {optimisticStatusChangedAt && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Status updated: {new Date(optimisticStatusChangedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, {new Date(optimisticStatusChangedAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </p>
                  )}
                </div>
                {!isEditorOrBelow && (
                  <button
                    onClick={handleTitleEdit}
                    className="opacity-0 group-hover/title:opacity-100 p-0.5 rounded hover:bg-accent transition-all"
                    title="Edit name"
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
                {/* Document attachment indicator */}
                {itemDocs.length > 0 && (
                  <button
                    onClick={() => { setPreviewDoc(itemDocs[0]); setPreviewOpen(true); }}
                    className="p-0.5 rounded hover:bg-accent transition-all"
                    title={`${itemDocs.length} document${itemDocs.length > 1 ? "s" : ""} attached — click to preview`}
                  >
                    <Paperclip className="w-3 h-3 text-primary/70" />
                  </button>
                )}
              </div>
            )}

            {/* Badges row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Party multi-select — inline editing */}
              {editingParty ? (
                <div className="flex items-center gap-1.5 min-w-[200px]">
                  <PartyMultiSelect
                    dealParties={dealParties}
                    value={selectedParties}
                    onChange={handlePartyChange}
                    className="flex-1"
                    disabled={updateParty.isPending}
                  />
                  <button
                    onClick={() => setEditingParty(false)}
                    className="p-0.5 rounded hover:bg-accent text-muted-foreground shrink-0"
                    title="Close"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : isAllParties ? (
                /* All Parties badge */
                <button
                  onClick={() => setEditingParty(true)}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/20 hover:opacity-80 transition-opacity cursor-pointer"
                  title="Click to change parties"
                >
                  <Users className="w-2.5 h-2.5" />
                  All Parties
                </button>
              ) : displayParties.length > 0 ? (
                /* Individual party tags */
                <div className="flex items-center gap-1 flex-wrap">
                  {displayParties.map((p) => (
                    <button
                      key={p}
                      onClick={() => setEditingParty(true)}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200 hover:opacity-80 transition-opacity cursor-pointer"
                      title="Click to change parties"
                    >
                      <Users className="w-2.5 h-2.5" />
                      {p}
                    </button>
                  ))}
                </div>
              ) : (
                /* Empty — ghost assign button */
                <button
                  onClick={() => setEditingParty(true)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
                  title="Assign party"
                >
                  <Users className="w-2.5 h-2.5" />
                  Assign party
                </button>
              )}

              {/* Deadline badge */}
              {deadlineLabel && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                    overdue
                      ? "bg-rose-50 text-rose-600 border-rose-200"
                      : approaching
                      ? "bg-amber-50 text-amber-600 border-amber-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
                  }`}
                >
                  {overdue ? <AlertCircle className="w-2.5 h-2.5" /> : approaching ? <Clock className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
                  {overdue ? "Overdue" : approaching ? "Due soon" : deadlineLabel}
                </span>
              )}
              {item.notes && <StickyNote className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
            </div>

            {/* Linked document attachment strip */}
            {itemDocs.length > 0 && (
              <div className="mt-2 space-y-1">
                {itemDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-md px-2 py-1 text-[11px] text-foreground max-w-[420px]"
                  >
                    <Paperclip className="w-3 h-3 text-primary/60 shrink-0" />
                    <span className="flex-1 truncate font-medium" title={doc.filename}>{doc.filename}</span>
                    <button
                      onClick={() => handleDownload(doc.storageKey, doc.filename)}
                      className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-primary"
                      title="Download document"
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    {!isEditorOrBelow && (
                      <button
                        onClick={() => {
                          setUnlinking(true);
                          linkToItem.mutate({ docId: doc.id, dealId, checklistItemId: null });
                        }}
                        disabled={unlinking}
                        className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-rose-500"
                        title="Remove attachment from this item"
                      >
                        {unlinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status dropdown */}
          <div className="shrink-0 w-36 mt-0.5">
            {isViewer ? (
              <div className={`h-7 text-xs px-2.5 rounded-md border font-medium flex items-center gap-1.5 ${STATUS_CLASSES[optimisticStatus]}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[optimisticStatus]}`} />
                {optimisticStatus}
              </div>
            ) : (
              <Select value={optimisticStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className={`h-7 text-xs px-2.5 rounded-md border font-medium ${STATUS_CLASSES[optimisticStatus]}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[optimisticStatus]}`} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                        {s}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Action buttons */}
          {!isViewer && (
            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
              {/* Hidden file input for per-item upload */}
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf" onChange={handleItemUpload} />
              {!isViewer && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded hover:bg-accent transition-colors"
                  title="Attach PDF to this item"
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <Upload className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              )}
              <button
                onClick={() => { setNotesValue(item.notes ?? ""); setNotesOpen((o) => !o); }}
                className="p-1 rounded hover:bg-accent transition-colors"
                title="Add / edit notes"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              {!isEditorOrBelow && (
                <button
                  onClick={() => { if (confirm("Remove this item?")) deleteItem.mutate({ itemId: item.id, dealId }); }}
                  className="p-1 rounded hover:bg-rose-50 transition-colors"
                  title="Delete item"
                  disabled={deleteItem.isPending}
                >
                  {deleteItem.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 text-rose-400 hover:text-rose-600" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Notes editor */}
        {notesOpen && (
          <div className="px-5 pb-3 pt-0">
            <div className="ml-7 space-y-2">
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add notes about this item…"
                className="text-xs resize-none min-h-[64px]"
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNotesOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={updateNotes.isPending}
                  onClick={() => updateNotes.mutate({ itemId: item.id, dealId, notes: notesValue })}
                >
                  {updateNotes.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </div>
          </div>
        )}
        </div>
      {/* PDF Preview Dialog */}
      {previewDoc && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
              <DialogTitle className="text-sm font-medium flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary/70" />
                {previewDoc.filename}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden">
              {itemDocs.length > 1 && (
                <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-border flex-wrap shrink-0">
                  {itemDocs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setPreviewDoc(d)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        previewDoc.id === d.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {d.filename}
                    </button>
                  ))}
                </div>
              )}
              <iframe
                src={previewDoc.previewUrl}
                className="w-full h-full border-0"
                title={previewDoc.filename}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
// ─── Add Item Form ─────────────────────────────────────────────────────────────

function AddItemForm({
  section,
  dealId,
  dealParties,
  onDone,
}: {
  section: SectionKey;
  dealId: number;
  dealParties: DealParties;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();

  const [title, setTitle] = useState("");
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [status, setStatus] = useState<ItemStatus>("Under Review");
  const inputRef = useRef<HTMLInputElement>(null);

  const createItem = trpc.items.create.useMutation({
    onSuccess: () => {
      utils.deals.get.invalidate({ dealId });
      setTitle("");
      setSelectedParties([]);
      setStatus("Under Review");
      onDone();
      toast.success("Item added");
    },
    onError: () => toast.error("Failed to add item"),
  });

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) { toast.error("Please enter an item name"); return; }
    createItem.mutate({
      dealId,
      section,
      title: trimmed,
      partiesJson: JSON.stringify(selectedParties),
      status,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") onDone();
  };

  return (
    <div className="px-5 py-3 bg-accent/20 border-b border-border">
      <div className="space-y-2.5">
        <Input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Item name…"
          className="text-sm h-8"
        />
        <div className="flex items-start gap-2">
          {/* Multi-select party */}
          <div className="flex-1">
            <PartyMultiSelect
              dealParties={dealParties}
              value={selectedParties}
              onChange={setSelectedParties}
            />
          </div>

          {/* Initial status */}
          <Select value={status} onValueChange={(v) => setStatus(v as ItemStatus)}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                    {s}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Actions */}
          <Button size="sm" className="h-7 text-xs px-3 shrink-0" onClick={handleSubmit} disabled={createItem.isPending}>
            {createItem.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Add
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2 shrink-0" onClick={onDone}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Section ───────────────────────────────────────────────────────────────────

export function ChecklistSection({ section, items, dealId, dealParties, myRole }: ChecklistSectionProps) {
  const isViewer = myRole === "viewer";
  const isEditorOrBelow = myRole === "viewer" || myRole === "editor";
  const utils = trpc.useUtils();
  const [addingItem, setAddingItem] = useState(false);
  const { data: allDocs, refetch: refetchDocs } = trpc.documents.list.useQuery({ dealId });
  // Build a map of checklistItemId → docs for fast lookup
  const docsByItem = (allDocs ?? []).reduce<Record<number, ItemDoc[]>>((acc, d) => {
    if (d.checklistItemId != null) {
      if (!acc[d.checklistItemId]) acc[d.checklistItemId] = [];
      acc[d.checklistItemId].push({ id: d.id, filename: d.filename, storageKey: d.storageKey, previewUrl: `/manus-storage/${d.storageKey}` });
    }
    return acc;
  }, {});
  const handleDocUploaded = () => {
    refetchDocs();
    utils.documents.list.invalidate({ dealId });
  };
  const executed = items.filter((i) => i.status === "Executed" || i.status === "Waived").length;
  const pct = items.length > 0 ? Math.round((executed / items.length) * 100) : 0;
  const overdueCount = items.filter((i) => isOverdue(i.deadline, i.status)).length;

  return (
    <section id={`section-${section}`} className="scroll-mt-4">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 py-3 bg-muted/60 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-sm font-bold text-foreground">{SECTION_LABELS[section]}</h2>
          <span className="text-xs text-muted-foreground">{executed}/{items.length} resolved</span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
              <AlertCircle className="w-2.5 h-2.5" />
              {overdueCount} overdue
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary/60 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-medium text-muted-foreground w-8 text-right">{pct}%</span>
          </div>
          {!isEditorOrBelow && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => setAddingItem(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add item
            </Button>
          )}
        </div>
      </div>

      {/* Items */}
      <div>
        {items.length === 0 && !addingItem ? (
          <div className="px-5 py-6 flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-muted-foreground">No items yet in this section.</p>
            {!isEditorOrBelow && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 mt-1"
                onClick={() => setAddingItem(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add first item
              </Button>
            )}
          </div>
        ) : (
          items.map((item) => (
            <ItemRow key={item.id} item={item} dealId={dealId} dealParties={dealParties} itemDocs={docsByItem[item.id] ?? []} onDocUploaded={handleDocUploaded} myRole={myRole} />
          ))
        )}
      </div>

      {/* Inline add form — only for admins/owners */}
      {addingItem && !isEditorOrBelow && (
        <AddItemForm
          section={section}
          dealId={dealId}
          dealParties={dealParties}
          onDone={() => setAddingItem(false)}
        />
      )}
    </section>
  );
}
