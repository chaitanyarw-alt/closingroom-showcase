import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

interface ChecklistItem {
  id: number;
  title: string;
  section: string;
}

interface DocumentsPanelProps {
  dealId: number;
  items?: ChecklistItem[];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SECTION_LABELS: Record<string, string> = {
  conditions_precedent: "CPs",
  transaction_documents: "Docs",
  post_closing: "Post-Closing",
};

export function DocumentsPanel({ dealId, items = [] }: DocumentsPanelProps) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Link-to-item state: which doc is showing the item picker
  const [linkingDocId, setLinkingDocId] = useState<number | null>(null);

  const { data: docs, isLoading } = trpc.documents.list.useQuery({ dealId });

  const getUploadUrl = trpc.documents.getUploadUrl.useMutation();
  const confirmUpload = trpc.documents.confirmUpload.useMutation();
  const linkToItem = trpc.documents.linkToItem.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate({ dealId });
      setLinkingDocId(null);
      toast.success("Document linked to checklist item");
    },
    onError: () => toast.error("Failed to link document"),
  });
  const deleteDoc = trpc.documents.delete.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate({ dealId });
      toast.success("Document removed");
    },
    onError: () => toast.error("Failed to remove document"),
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }

    setUploading(true);
    try {
      const { docId, key } = await getUploadUrl.mutateAsync({
        dealId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await confirmUpload.mutateAsync({ docId, dealId, storageKey: key, fileContent: base64, filename: file.name });
      utils.documents.list.invalidate({ dealId });
      toast.success("Document uploaded");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLinkToItem = (docId: number, checklistItemId: number) => {
    linkToItem.mutate({ docId, dealId, checklistItemId });
  };

  const handleUnlink = (docId: number) => {
    linkToItem.mutate({ docId, dealId, checklistItemId: null });
    toast.success("Document unlinked from checklist item");
  };

  // Build a map of itemId → item for quick lookup
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Upload area */}
      <div className="shrink-0 p-4 border-b border-border">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.rtf"
          onChange={handleFileSelect}
        />
        <Button
          className="w-full"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {uploading ? "Uploading…" : "Upload Document"}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          PDF, Word, or text files up to 10 MB.
        </p>
      </div>

      {/* Documents list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !docs || docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              No documents uploaded yet. Upload a document to store it against this deal.
            </p>
          </div>
        ) : (
          docs.map((doc) => {
            const linkedItem = doc.checklistItemId ? itemMap[doc.checklistItemId] : null;
            const isLinking = linkingDocId === doc.id;

            return (
              <div key={doc.id} className="border border-border rounded-lg p-3 bg-card">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{doc.filename}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatBytes(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
        
                    {/* Linked item badge */}
                    {linkedItem && (
                      <div className="flex items-center gap-1 mt-1">
                        <Paperclip className="w-2.5 h-2.5 text-primary/70 shrink-0" />
                        <span className="text-[10px] text-primary/80 truncate">
                          {SECTION_LABELS[linkedItem.section] ?? linkedItem.section}: {linkedItem.title}
                        </span>
                        <button
                          onClick={() => handleUnlink(doc.id)}
                          className="shrink-0 text-muted-foreground hover:text-rose-500 transition-colors"
                          title="Unlink from item"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Link to item button */}
                    {items.length > 0 && (
                      <button
                        onClick={() => setLinkingDocId(isLinking ? null : doc.id)}
                        className={`p-1.5 rounded hover:bg-accent transition-colors ${isLinking ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                        title="Link to checklist item"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteDoc.mutate({ docId: doc.id, dealId })}
                      className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-rose-500"
                      title="Remove document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Item picker dropdown */}
                {isLinking && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground font-medium mb-1.5">Link to checklist item:</p>
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleLinkToItem(doc.id, item.id)}
                          disabled={linkToItem.isPending}
                          className={`w-full text-left px-2 py-1.5 rounded text-[10px] hover:bg-accent transition-colors flex items-start gap-1.5 ${doc.checklistItemId === item.id ? "bg-primary/10 text-primary font-medium" : "text-foreground"}`}
                        >
                          <span className="shrink-0 text-muted-foreground font-medium">{SECTION_LABELS[item.section] ?? item.section}:</span>
                          <span className="truncate">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted text preview */}
                {doc.extractedText && !isLinking && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground line-clamp-3">
                      {doc.extractedText}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
