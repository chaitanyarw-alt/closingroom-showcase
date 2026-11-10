/**
 * NewDealModal — shared two-step New Deal setup form.
 *
 * Props:
 *   open        — controlled open state
 *   onOpenChange — called when the dialog requests open/close
 *   onSuccess   — called with the new dealId after successful creation
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Governing law options ───────────────────────────────────────────────────

const GOVERNING_LAW_OPTIONS = [
  "English law",
  "Scots law",
  "Irish law",
  "New York law",
  "Delaware law",
  "German law",
  "French law",
  "Dutch law",
  "Luxembourg law",
  "Singapore law",
  "Hong Kong law",
  "UAE law",
  "Other",
];

// ─── Deal structure options ───────────────────────────────────────────────────

const DEAL_STRUCTURES = [
  "Share Purchase",
  "Asset Purchase",
  "Merger",
  "Management Buyout (MBO)",
  "Management Buyin (MBI)",
  "Leveraged Buyout (LBO)",
  "Joint Venture",
  "Carve-out / Spin-off",
  "Minority Stake Acquisition",
  "Other",
];

// ─── Dynamic label helpers ────────────────────────────────────────────────────

const COMPANY_LABEL_MAP: Record<string, string> = {
  "Share Purchase": "Target company name",
  "Asset Purchase": "Target company name",
  "Merger": "Merging entity name",
  "Management Buyout (MBO)": "Company name",
  "Management Buyin (MBI)": "Company name",
  "Leveraged Buyout (LBO)": "Company name",
  "Joint Venture": "JV company name",
  "Carve-out / Spin-off": "Carved-out entity name",
  "Minority Stake Acquisition": "Target company name",
  "Other": "Company name",
};

function getCompanyLabel(dealStructure: string): string {
  return COMPANY_LABEL_MAP[dealStructure] ?? "Company name";
}

const DEAL_VALUE_LABEL_MAP: Record<string, string> = {
  "Share Purchase": "Deal value / consideration",
  "Asset Purchase": "Deal value / consideration",
  "Merger": "Combined entity value",
  "Management Buyout (MBO)": "Deal value / consideration",
  "Management Buyin (MBI)": "Deal value / consideration",
  "Leveraged Buyout (LBO)": "Deal value / consideration",
  "Joint Venture": "Total JV investment",
  "Carve-out / Spin-off": "Carve-out value",
  "Minority Stake Acquisition": "Deal value / consideration",
  "Other": "Deal value / consideration",
};

function getDealValueLabel(dealStructure: string): string {
  return DEAL_VALUE_LABEL_MAP[dealStructure] ?? "Deal value / consideration";
}

function getLongstopLabel(dealStructure: string): string {
  return dealStructure === "Merger" ? "Termination date" : "Longstop date";
}

function getClosingDateLabel(dealStructure: string): string {
  if (dealStructure === "Merger") return "Target effective date";
  if (dealStructure === "Joint Venture") return "Target establishment date";
  return "Target closing date";
}

// ─── Form state types ─────────────────────────────────────────────────────────

interface Step1 {
  name: string;
  targetCompany: string;
  dealStructure: string;
  dealStructureOther: string;
  dealValue: string;
  governingLaw: string;
  longstopDate: string;
  closingDate: string;
}

interface Step2 {
  buyerName: string;
  sellerName: string;
  buyerCounsel: string;
  sellerCounsel: string;
}

const emptyStep1 = (): Step1 => ({
  name: "",
  targetCompany: "",
  dealStructure: "",
  dealStructureOther: "",
  dealValue: "",
  governingLaw: "",
  longstopDate: "",
  closingDate: "",
});

const emptyStep2 = (): Step2 => ({
  buyerName: "",
  sellerName: "",
  buyerCounsel: "",
  sellerCounsel: "",
});

// ─── Component ────────────────────────────────────────────────────────────────

interface NewDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the newly created dealId so the caller can navigate. */
  onSuccess: (dealId: number) => void;
}

export function NewDealModal({ open, onOpenChange, onSuccess }: NewDealModalProps) {
  const utils = trpc.useUtils();

  const [step, setStep] = useState<1 | 2>(1);
  const [s1, setS1] = useState<Step1>(emptyStep1());
  const [s2, setS2] = useState<Step2>(emptyStep2());
  const [s1Errors, setS1Errors] = useState<Partial<Record<keyof Step1, string>>>({});
  const [s2Errors, setS2Errors] = useState<Partial<Record<keyof Step2, string>>>({});
  // Track whether user explicitly selected "Other" for governing law
  const [governingLawIsOther, setGoverningLawIsOther] = useState(false);
  // Combobox open state for governing law
  const [govLawOpen, setGovLawOpen] = useState(false);

  /** Reset all form state to its initial values. */
  function resetForm() {
    setStep(1);
    setS1(emptyStep1());
    setS2(emptyStep2());
    setS1Errors({});
    setS2Errors({});
    setGoverningLawIsOther(false);
    setGovLawOpen(false);
  }

  const createDeal = trpc.deals.create.useMutation({
    onSuccess: (data) => {
      utils.deals.list.invalidate();
      utils.deals.dashboard.invalidate();
      // Close and clear the form immediately so stale data is never visible
      onOpenChange(false);
      resetForm();
      toast.success("Deal created");
      onSuccess(data.dealId);
    },
    onError: () => toast.error("Failed to create deal"),
  });

  function handleClose() {
    onOpenChange(false);
    resetForm();
  }

  function validateStep1(): boolean {
    const errs: Partial<Record<keyof Step1, string>> = {};
    if (!s1.name.trim()) errs.name = "Required";
    if (!s1.targetCompany.trim()) errs.targetCompany = "Required";
    if (!s1.dealStructure) errs.dealStructure = "Required";
    if (s1.dealStructure === "Other" && !s1.dealStructureOther.trim())
      errs.dealStructureOther = "Please describe the deal type";
    if (!s1.dealValue.trim()) errs.dealValue = "Required";
    if (!s1.governingLaw.trim()) errs.governingLaw = "Required";
    if (!s1.closingDate) errs.closingDate = "Required";
    setS1Errors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    const errs: Partial<Record<keyof Step2, string>> = {};
    if (!s2.buyerName.trim()) errs.buyerName = "Required";
    if (!s2.sellerName.trim()) errs.sellerName = "Required";
    if (!s2.buyerCounsel.trim()) errs.buyerCounsel = "Required";
    if (!s2.sellerCounsel.trim()) errs.sellerCounsel = "Required";
    setS2Errors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (validateStep1()) setStep(2);
  }

  function handleSubmit() {
    if (!validateStep2()) return;
    createDeal.mutate({
      name: s1.name.trim(),
      targetCompany: s1.targetCompany.trim(),
      dealStructure: s1.dealStructure,
      dealStructureOther: s1.dealStructure === "Other" ? s1.dealStructureOther.trim() : undefined,
      dealValue: s1.dealValue.trim(),
      governingLaw: s1.governingLaw.trim(),
      longstopDate: s1.longstopDate || undefined,
      closingDate: s1.closingDate,
      buyerName: s2.buyerName.trim(),
      sellerName: s2.sellerName.trim(),
      buyerCounsel: s2.buyerCounsel.trim(),
      sellerCounsel: s2.sellerCounsel.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">New Deal</DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-1">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 1 ? "text-primary" : "text-muted-foreground"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${step === 1 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>1</span>
              Deal Identity &amp; Key Dates
            </div>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 2 ? "text-primary" : "text-muted-foreground"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${step === 2 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>2</span>
              Parties &amp; Advisers
            </div>
          </div>
        </DialogHeader>

        {/* ── Step 1 ──────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {/* Deal Name */}
            <div className="space-y-1.5">
              <Label htmlFor="nd-deal-name">Deal Name <span className="text-rose-500">*</span></Label>
              <Input
                id="nd-deal-name"
                placeholder="e.g. Acquisition of Acme Corp"
                value={s1.name}
                onChange={(e) => setS1({ ...s1, name: e.target.value })}
                className={s1Errors.name ? "border-rose-400" : ""}
              />
              {s1Errors.name && <p className="text-xs text-rose-500">{s1Errors.name}</p>}
            </div>

            {/* Target Company */}
            <div className="space-y-1.5">
              <Label htmlFor="nd-target-company">{getCompanyLabel(s1.dealStructure)} <span className="text-rose-500">*</span></Label>
              <Input
                id="nd-target-company"
                placeholder="e.g. Acme Corporation Ltd"
                value={s1.targetCompany}
                onChange={(e) => setS1({ ...s1, targetCompany: e.target.value })}
                className={s1Errors.targetCompany ? "border-rose-400" : ""}
              />
              {s1Errors.targetCompany && <p className="text-xs text-rose-500">{s1Errors.targetCompany}</p>}
            </div>

            {/* Deal Structure */}
            <div className="space-y-1.5">
              <Label htmlFor="nd-deal-structure">Deal Structure <span className="text-rose-500">*</span></Label>
              <Select
                value={s1.dealStructure}
                onValueChange={(v) => setS1({ ...s1, dealStructure: v, dealStructureOther: v !== "Other" ? "" : s1.dealStructureOther })}
              >
                <SelectTrigger id="nd-deal-structure" className={s1Errors.dealStructure ? "border-rose-400" : ""}>
                  <SelectValue placeholder="Select deal structure…" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STRUCTURES.map((ds) => (
                    <SelectItem key={ds} value={ds}>{ds}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {s1Errors.dealStructure && <p className="text-xs text-rose-500">{s1Errors.dealStructure}</p>}
            </div>

            {/* Other deal structure */}
            {s1.dealStructure === "Other" && (
              <div className="space-y-1.5">
                <Label htmlFor="nd-deal-structure-other">Please describe the deal type <span className="text-rose-500">*</span></Label>
                <Input
                  id="nd-deal-structure-other"
                  placeholder="e.g. Debt-for-equity swap"
                  value={s1.dealStructureOther}
                  onChange={(e) => setS1({ ...s1, dealStructureOther: e.target.value })}
                  className={s1Errors.dealStructureOther ? "border-rose-400" : ""}
                />
                {s1Errors.dealStructureOther && <p className="text-xs text-rose-500">{s1Errors.dealStructureOther}</p>}
              </div>
            )}

            {/* Deal Value */}
            <div className="space-y-1.5">
              <Label htmlFor="nd-deal-value">{getDealValueLabel(s1.dealStructure)} <span className="text-rose-500">*</span></Label>
              <Input
                id="nd-deal-value"
                placeholder="e.g. £45,000,000"
                value={s1.dealValue}
                onChange={(e) => setS1({ ...s1, dealValue: e.target.value })}
                className={s1Errors.dealValue ? "border-rose-400" : ""}
              />
              {s1Errors.dealValue && <p className="text-xs text-rose-500">{s1Errors.dealValue}</p>}
            </div>

            {/* Governing Law */}
            <div className="space-y-1.5">
              <Label htmlFor="nd-governing-law">Governing Law <span className="text-rose-500">*</span></Label>
              {/* Searchable combobox for governing law */}
              <Popover open={govLawOpen} onOpenChange={setGovLawOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    id="nd-governing-law"
                    role="combobox"
                    aria-expanded={govLawOpen}
                    className={`flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                      s1Errors.governingLaw ? "border-rose-400" : "border-input"
                    }`}
                  >
                    <span className={governingLawIsOther ? "text-foreground" : s1.governingLaw ? "text-foreground" : "text-muted-foreground"}>
                      {governingLawIsOther ? "Other" : s1.governingLaw || "Select governing law"}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search governing law..." />
                    <CommandList>
                      <CommandEmpty>No match found.</CommandEmpty>
                      <CommandGroup>
                        {GOVERNING_LAW_OPTIONS.map((opt) => (
                          <CommandItem
                            key={opt}
                            value={opt}
                            onSelect={(val) => {
                              const selected = GOVERNING_LAW_OPTIONS.find(
                                (o) => o.toLowerCase() === val.toLowerCase()
                              ) ?? val;
                              if (selected === "Other") {
                                setGoverningLawIsOther(true);
                                setS1({ ...s1, governingLaw: "" });
                              } else {
                                setGoverningLawIsOther(false);
                                setS1({ ...s1, governingLaw: selected });
                              }
                              setGovLawOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                (!governingLawIsOther && s1.governingLaw === opt) ||
                                (governingLawIsOther && opt === "Other")
                                  ? "opacity-100"
                                  : "opacity-0"
                              }`}
                            />
                            {opt}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* Free-text input shown only when user explicitly chose Other */}
              {governingLawIsOther && (
                <Input
                  placeholder="Enter governing law jurisdiction"
                  value={s1.governingLaw}
                  onChange={(e) => setS1({ ...s1, governingLaw: e.target.value })}
                  className={s1Errors.governingLaw ? "border-rose-400" : ""}
                  autoFocus
                />
              )}
              {s1Errors.governingLaw && <p className="text-xs text-rose-500">{s1Errors.governingLaw}</p>}
            </div>

            {/* Dates — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nd-longstop-date">{getLongstopLabel(s1.dealStructure)} <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="nd-longstop-date"
                  type="date"
                  value={s1.longstopDate}
                  onChange={(e) => setS1({ ...s1, longstopDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nd-closing-date">{getClosingDateLabel(s1.dealStructure)} <span className="text-rose-500">*</span></Label>
                <Input
                  id="nd-closing-date"
                  type="date"
                  value={s1.closingDate}
                  onChange={(e) => setS1({ ...s1, closingDate: e.target.value })}
                  className={s1Errors.closingDate ? "border-rose-400" : ""}
                />
                {s1Errors.closingDate && <p className="text-xs text-rose-500">{s1Errors.closingDate}</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2 ──────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nd-buyer-name">Buyer Name <span className="text-rose-500">*</span></Label>
              <Input
                id="nd-buyer-name"
                placeholder="e.g. Horizon Capital Partners Ltd"
                value={s2.buyerName}
                onChange={(e) => setS2({ ...s2, buyerName: e.target.value })}
                className={s2Errors.buyerName ? "border-rose-400" : ""}
              />
              {s2Errors.buyerName && <p className="text-xs text-rose-500">{s2Errors.buyerName}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nd-seller-name">Seller Name <span className="text-rose-500">*</span></Label>
              <Input
                id="nd-seller-name"
                placeholder="e.g. Acme Corporation Ltd"
                value={s2.sellerName}
                onChange={(e) => setS2({ ...s2, sellerName: e.target.value })}
                className={s2Errors.sellerName ? "border-rose-400" : ""}
              />
              {s2Errors.sellerName && <p className="text-xs text-rose-500">{s2Errors.sellerName}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nd-buyer-counsel">Buyer's Counsel <span className="text-rose-500">*</span></Label>
              <Input
                id="nd-buyer-counsel"
                placeholder="e.g. Clifford Chance LLP"
                value={s2.buyerCounsel}
                onChange={(e) => setS2({ ...s2, buyerCounsel: e.target.value })}
                className={s2Errors.buyerCounsel ? "border-rose-400" : ""}
              />
              {s2Errors.buyerCounsel && <p className="text-xs text-rose-500">{s2Errors.buyerCounsel}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nd-seller-counsel">Seller's Counsel <span className="text-rose-500">*</span></Label>
              <Input
                id="nd-seller-counsel"
                placeholder="e.g. Linklaters LLP"
                value={s2.sellerCounsel}
                onChange={(e) => setS2({ ...s2, sellerCounsel: e.target.value })}
                className={s2Errors.sellerCounsel ? "border-rose-400" : ""}
              />
              {s2Errors.sellerCounsel && <p className="text-xs text-rose-500">{s2Errors.sellerCounsel}</p>}
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <DialogFooter className="gap-2">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button disabled={createDeal.isPending} onClick={handleSubmit}>
                {createDeal.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Deal
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
