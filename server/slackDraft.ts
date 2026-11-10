import { z } from "zod";

export type SlackDraft = { response: string; reviewer_notes: string };
export type SlackDraftDeal = {
  name: string;
  targetCompany?: string | null;
  buyerName?: string | null;
  sellerName?: string | null;
  closingDate?: string | Date | null;
  longstopDate?: string | Date | null;
};

export const slackDraftResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "closingroom_slack_draft",
    strict: true,
    schema: {
      type: "object",
      properties: {
        response: { type: "string", description: "The business-facing answer only. No internal lawyer guidance or review notes." },
        reviewer_notes: { type: "string", description: "Lawyer-only checks, uncertainties, missing information and judgement points. Never sent to the business." },
      },
      required: ["response", "reviewer_notes"],
      additionalProperties: false,
    },
  },
};

const draftSchema = z.strictObject({ response: z.string().trim().min(1), reviewer_notes: z.string().trim() });
export const MISSING_LONGSTOP_RESPONSE = "The deal's long-stop date is not recorded in ClosingRoom.";
export const MISSING_LONGSTOP_REVIEWER_NOTE = "Long-stop date is not recorded. Check the signed transaction documents and confirm the long-stop date; do not substitute the target closing date.";

function recordedDate(value: SlackDraftDeal["closingDate"]): Date | undefined {
  if (!value) return undefined;
  // MySQL datetime strings have no zone. Treat database business dates as UTC.
  const normalized = typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(" ", "T") + "Z" : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function isoDate(value: SlackDraftDeal["closingDate"]) {
  return recordedDate(value)?.toISOString().slice(0, 10) ?? null;
}

export function buildSlackDraftContext(deal?: SlackDraftDeal) {
  return deal ? {
    transaction: deal.name,
    target_company: deal.targetCompany ?? null,
    buyer: deal.buyerName ?? null,
    seller: deal.sellerName ?? null,
    target_closing_date: isoDate(deal.closingDate),
    long_stop_date: isoDate(deal.longstopDate),
    date_rule: "target_closing_date and long_stop_date are different fields. A null long_stop_date means it is not recorded. Never infer it from target_closing_date.",
  } : { transaction: null, target_closing_date: null, long_stop_date: null,
    date_rule: "No deal is assigned. No long-stop date is recorded for this intake. Do not invent deal-specific facts or dates." };
}

export function assertBusinessFacingResponse(response: string, reviewerNotes = "") {
  const text = response.trim();
  if (!text) throw new Error("Enter a business-facing response before approval.");
  // Defense in depth for the specific leakage, without removing business-facing
  // caveats or silently editing a lawyer's approved legal answer.
  const internalGuidance = /\breviewer[_\s-]+notes\b|\blawyer[-\s]+only\b|\binternal\s+(?:review\s+)?(?:notes?|guidance)\b|\blawyer(?:'s)?\s+judg(?:e)?ment\b|\b(?:notes?|guidance|instructions?|checks?)\s+(?:for|to)\s+(?:the\s+)?(?:lawyer|reviewer)\b/i;
  if (internalGuidance.test(text)) throw new Error("Lawyer-only guidance cannot be posted. Keep it in reviewer notes and enter only the business-facing answer.");
  // A whole reviewer note (or substantial note line) pasted into the business
  // field is not allowed; notes are never automatically appended or stripped.
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  const noteLines = [reviewerNotes, ...reviewerNotes.split(/\n+/)].map((line) => line.trim().toLowerCase().replace(/\s+/g, " "));
  if (noteLines.some((line) => line.length >= 24 && line !== MISSING_LONGSTOP_RESPONSE.toLowerCase() && normalized.includes(line))) {
    throw new Error("The response contains lawyer-only reviewer notes. Remove them from the business-facing answer before posting.");
  }
  return text;
}

const longstopMention = /long[\s-]?stop/i;
function dateVariants(value: SlackDraftDeal["closingDate"]) {
  const date = recordedDate(value);
  if (!date) return [];
  const day = date.getUTCDate(), month = date.getUTCMonth() + 1, year = date.getUTCFullYear();
  const shortMonth = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const longMonth = date.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return [date.toISOString().slice(0, 10), `${day}/${month}/${year}`, `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
    `${day} ${shortMonth} ${year}`, `${day} ${longMonth} ${year}`, `${shortMonth} ${day}, ${year}`, `${longMonth} ${day}, ${year}`]
    .map((text) => text.toLowerCase());
}

export function assertLongstopDateAccuracy(response: string, deal?: SlackDraftDeal) {
  const context = buildSlackDraftContext(deal);
  const clauses = response.split(/[.!?\n]+/).filter((clause) => longstopMention.test(clause));
  if (!context.long_stop_date) {
    const datePattern = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\b|\b(?:jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\s+\d{1,2}\b/i;
    if (clauses.some((clause) => datePattern.test(clause))) {
      throw new Error("No long-stop date is recorded. Do not state a date or substitute the target closing date.");
    }
  }
  if (deal && context.target_closing_date && context.target_closing_date !== context.long_stop_date) {
    const targetDates = dateVariants(deal.closingDate);
    if (clauses.some((clause) => targetDates.some((date) => clause.toLowerCase().includes(date)))) {
      throw new Error("The target closing date must not be presented as the long-stop date.");
    }
  }
}

export function parseSlackDraft(content: unknown, deal?: SlackDraftDeal): SlackDraft {
  // Never fall back to posting malformed JSON, a monolithic legacy draft or a
  // model refusal. The intake fails safely and the lawyer can compose manually.
  if (typeof content !== "string") throw new Error("Clark did not return a valid separated draft.");
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error("Clark did not return a valid separated draft."); }
  const result = draftSchema.safeParse(parsed);
  if (!result.success) throw new Error("Clark did not return both response and reviewer_notes as separate text fields.");
  const draft = result.data;
  assertBusinessFacingResponse(draft.response, draft.reviewer_notes);
  assertLongstopDateAccuracy(draft.response, deal);
  if (!buildSlackDraftContext(deal).long_stop_date) {
    if (!draft.response.includes(MISSING_LONGSTOP_RESPONSE)) draft.response += `\n\n${MISSING_LONGSTOP_RESPONSE}`;
    if (!draft.reviewer_notes.includes(MISSING_LONGSTOP_REVIEWER_NOTE)) {
      draft.reviewer_notes = [draft.reviewer_notes, MISSING_LONGSTOP_REVIEWER_NOTE].filter(Boolean).join("\n\n");
    }
  }
  return draft;
}
