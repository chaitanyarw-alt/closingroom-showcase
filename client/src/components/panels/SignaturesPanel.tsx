import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, PenLine, Signature } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SignaturesPanelProps {
  dealId: number;
  items: Array<{ id: number; title: string; section: string; status: string }>;
}

const SIG_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  received: "Received",
  rejected: "Rejected",
};

const SIG_METHOD_LABELS: Record<string, string> = {
  wet_ink: "Wet Ink",
  electronic: "Electronic",
  counterpart: "Counterpart",
};

const SIG_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

export function SignaturesPanel({ dealId, items }: SignaturesPanelProps) {
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryParty, setSignatoryParty] = useState("");
  const [method, setMethod] = useState<"wet_ink" | "electronic" | "counterpart">("electronic");

  const { data: signatures, isLoading } = trpc.signatures.list.useQuery({ dealId });

  const addSignature = trpc.signatures.create.useMutation({
    onSuccess: () => {
      utils.signatures.list.invalidate({ dealId });
      setDialogOpen(false);
      setSelectedItemId("");
      setSignatoryName("");
      setSignatoryParty("");
      setMethod("electronic");
      toast.success("Signature page tracked");
    },
    onError: () => toast.error("Failed to add signature"),
  });

  const updateStatus = trpc.signatures.updateStatus.useMutation({
    onSuccess: () => {
      utils.signatures.list.invalidate({ dealId });
      toast.success("Signature status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const docItems = items.filter((i) => i.section === "transaction_documents");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground">Signature Page Tracker</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Track which signature pages have been received and in what form.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setDialogOpen(true)}>
          Add
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !signatures || signatures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <Signature className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              No signature pages tracked yet. Add signatories to monitor receipt of wet ink and electronic signatures.
            </p>
          </div>
        ) : (
          signatures.map((sig) => {
            const item = items.find((i) => i.id === sig.itemId);
            return (
              <div key={sig.id} className="border border-border rounded-lg p-3 bg-card">
                <div className="flex items-start gap-2">
                  <PenLine className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{sig.signatoryName}</p>
                    {sig.signatoryParty && (
                      <p className="text-[10px] text-muted-foreground">{sig.signatoryParty}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {SIG_METHOD_LABELS[sig.method] ?? sig.method}
                    </p>
                    {item && (
                      <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">Re: {item.title}</p>
                    )}
                    <div className="mt-1.5">
                      <Select
                        value={sig.status}
                        onValueChange={(val) =>
                          updateStatus.mutate({ sigId: sig.id, dealId, status: val as "pending" | "received" | "rejected" })
                        }
                      >
                        <SelectTrigger className={`h-6 text-[10px] px-2 rounded border font-medium ${SIG_STATUS_COLORS[sig.status] ?? ""}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(SIG_STATUS_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Signature Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Track Signature Page</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Document / Item</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document (optional)…" />
                </SelectTrigger>
                <SelectContent>
                  {docItems.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>{item.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Signatory Name *</Label>
              <Input
                placeholder="e.g. John Smith"
                value={signatoryName}
                onChange={(e) => setSignatoryName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Party / Organisation</Label>
              <Input
                placeholder="e.g. Acme Corp (Buyer)"
                value={signatoryParty}
                onChange={(e) => setSignatoryParty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Signature Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "wet_ink" | "electronic" | "counterpart")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SIG_METHOD_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!signatoryName.trim() || addSignature.isPending}
                onClick={() =>
                addSignature.mutate({
                  dealId,
                  itemId: selectedItemId ? parseInt(selectedItemId, 10) : undefined,
                  signatoryName: signatoryName.trim(),
                  signatoryParty: signatoryParty.trim() || "N/A",
                  method,
                })
              }
            >
              {addSignature.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
