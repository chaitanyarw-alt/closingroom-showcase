export type ItemStatus = "Executed" | "Under Review" | "Outstanding" | "Waived";

export type SectionKey =
  | "conditions_precedent"
  | "transaction_documents"
  | "post_closing";

export const SECTION_LABELS: Record<SectionKey, string> = {
  conditions_precedent: "Conditions Precedent",
  transaction_documents: "Transaction Documents",
  post_closing: "Post-Closing",
};

export const SECTION_ORDER: SectionKey[] = [
  "conditions_precedent",
  "transaction_documents",
  "post_closing",
];

export const STATUS_OPTIONS: ItemStatus[] = [
  "Executed",
  "Under Review",
  "Outstanding",
  "Waived",
];

export const STATUS_CLASSES: Record<ItemStatus, string> = {
  Executed: "status-executed",
  "Under Review": "status-pending",
  Outstanding: "status-outstanding",
  Waived: "status-waived",
};

export const STATUS_DOT: Record<ItemStatus, string> = {
  Executed: "bg-emerald-500",
  "Under Review": "bg-amber-400",
  Outstanding: "bg-rose-500",
  Waived: "bg-slate-400",
};
