import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addAuditEntry,
  createChecklistItem,
  createDeal,
  createDocument,
  createSignaturePage,
  deleteDeal,
  deleteDocument,
  deleteSignaturePage,
  getAllDealsForDashboard,
  getAuditLog,
  getChatHistory,
  getChecklistItems,
  getDealById,
  getDealMembers,
  getDealMember,
  getDealMemberByToken,
  getDealMemberByEmail,
  createDealInvite,
  acceptDealInvite,
  removeDealMember,
  updateDealMemberRole,
  touchDealMemberAccess,
  getDealAccessRole,
  type MemberRole,
  getDealsForUser,
  getDocuments,
  getDocumentsByItem,
  getSignaturePages,
  getUserByOpenId,
  saveChatMessage,
  updateDeal,
  updateDocumentExtraction,
  updateDocumentStorageKey,
  updateItemDeadline,
  updateItemNotes,
  updateItemStatus,
  updateItemTitle,
  updateItemParty,
  deleteChecklistItem,
  updateSignaturePageStatus,
  markDealAsViewed,
  linkDocumentToItem,
  getConversationThreads,
  createConversationThread,
  updateConversationThreadTitle,
  deleteConversationThread,
	getConversationMessages,
	saveConversationMessage,
		listSlackIntakes,
		getSlackIntakeById,
		getSlackWorkspaceLink,
		getSlackWorkspaceDealById,
		linkSlackIntakeToDeal,
		approveSlackIntake,
		rejectSlackIntake,
} from "./db";
import { invokeLLM } from "./_core/llm";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut, storageGet, storageGetSignedUrl } from "./storage";
import { postApprovedSlackResponse } from "./slack";
import { assertBusinessFacingResponse, assertLongstopDateAccuracy } from "./slackDraft";

const ITEM_STATUS = z.enum(["Executed", "Under Review", "Outstanding", "Waived"]);
const PARTY = z.enum(["buyer_counsel", "seller_counsel", "bank", "owner"]);

// ─── Deals ────────────────────────────────────────────────────────────────────

const dealsRouter = router({
  list: protectedProcedure.query(({ ctx }) => getDealsForUser(ctx.user.id)),

  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const allDeals = await getAllDealsForDashboard(ctx.user.id);
    const summaries = await Promise.all(
      allDeals.map(async (deal) => {
        const items = await getChecklistItems(deal.id);
        const total = items.length;
        const executed = items.filter((i) => i.status === "Executed").length;
        const outstanding = items.filter((i) => i.status === "Outstanding").length;
        const underReview = items.filter((i) => i.status === "Under Review").length;
        const waived = items.filter((i) => i.status === "Waived").length;
        const atRisk = items.filter(
          (i) => i.status === "Outstanding" || (i.deadline && new Date(i.deadline) < new Date() && i.status !== "Executed" && i.status !== "Waived")
        ).length;
        // CP-specific breakdown for health indicator
        const cpItems = items.filter((i) => i.section === "conditions_precedent");
        const cpOutstanding = cpItems.filter((i) => i.status === "Outstanding").length;
        const cpUnderReview = cpItems.filter((i) => i.status === "Under Review").length;
        const lastItemUpdatedAt = items.length > 0
          ? new Date(Math.max(...items.map((i) => new Date(i.updatedAt).getTime())))
          : null;
        return {
          deal,
          total,
          executed,
          outstanding,
          underReview,
          waived,
          atRisk,
          cpOutstanding,
          cpUnderReview,
          progress: total > 0 ? Math.round(((executed + waived) / total) * 100) : 0,
          lastItemUpdatedAt,
        };
      })
    );
    return summaries;
  }),

  get: protectedProcedure.input(z.object({ dealId: z.number() })).query(async ({ ctx, input }) => {
    const deal = await getDealById(input.dealId, ctx.user.id);
    if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
    const items = await getChecklistItems(input.dealId);
    const myRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
    return { deal, items, myRole };
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      closingDate: z.string().optional(),
      targetCompany: z.string().optional(),
      dealStructure: z.string().optional(),
      dealStructureOther: z.string().optional(),
      dealValue: z.string().optional(),
      governingLaw: z.string().optional(),
      longstopDate: z.string().optional(),
      buyerName: z.string().optional(),
      sellerName: z.string().optional(),
      buyerCounsel: z.string().optional(),
      sellerCounsel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dealId = await createDeal(ctx.user.id, {
        name: input.name,
        description: input.description,
        closingDate: input.closingDate ? new Date(input.closingDate) : undefined,
        targetCompany: input.targetCompany,
        dealStructure: input.dealStructure,
        dealStructureOther: input.dealStructureOther,
        dealValue: input.dealValue,
        governingLaw: input.governingLaw,
        longstopDate: input.longstopDate ? new Date(input.longstopDate) : undefined,
        buyerName: input.buyerName,
        sellerName: input.sellerName,
        buyerCounsel: input.buyerCounsel,
        sellerCounsel: input.sellerCounsel,
      });
      await addAuditEntry(dealId, ctx.user.id, ctx.user.name, "deal_created", { metadata: input.name });
      return { dealId };
    }),

  update: protectedProcedure
    .input(z.object({
      dealId: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      closingDate: z.string().optional(),
      targetCompany: z.string().optional(),
      dealStructure: z.string().optional(),
      dealStructureOther: z.string().optional(),
      dealValue: z.string().optional(),
      governingLaw: z.string().optional(),
      longstopDate: z.string().optional(),
      buyerName: z.string().optional(),
      sellerName: z.string().optional(),
      buyerCounsel: z.string().optional(),
      sellerCounsel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { dealId, ...rest } = input;
      await updateDeal(dealId, ctx.user.id, {
        ...rest,
        closingDate: rest.closingDate ? new Date(rest.closingDate) : undefined,
        longstopDate: rest.longstopDate ? new Date(rest.longstopDate) : undefined,
      });
      await addAuditEntry(dealId, ctx.user.id, ctx.user.name, "deal_updated", { metadata: rest.name ?? "" });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteDeal(input.dealId, ctx.user.id);
      return { success: true };
    }),

  markAsViewed: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await markDealAsViewed(input.dealId, ctx.user.id);
      return { success: true };
    }),
});

// ─── Checklist Items ──────────────────────────────────────────────────────────

const itemsRouter = router({
  create: protectedProcedure
    .input(z.object({
      dealId: z.number(),
      section: z.enum(["conditions_precedent", "transaction_documents", "post_closing"]),
      title: z.string().min(1),
      party: z.enum(["buyer_counsel", "seller_counsel", "bank", "all", "other"]).optional(),
      partyLabel: z.string().optional(),
      partyCustom: z.string().optional(),
      partiesJson: z.string().optional(),
      status: ITEM_STATUS.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer" || accessRole === "editor") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to add items" });
      const items = await getChecklistItems(input.dealId);
      const sectionItems = items.filter((i) => i.section === input.section);
      const sortOrder = sectionItems.length + 1;
      const itemId = await createChecklistItem(
        input.dealId, input.section, input.title, sortOrder,
        input.party ?? "all", input.status ?? "Under Review",
        input.partyLabel, input.partyCustom, input.partiesJson
      );
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "item_created", { itemId, toValue: input.title });
      return { itemId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({ itemId: z.number(), dealId: z.number(), status: ITEM_STATUS }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot update item statuses" });
      const items = await getChecklistItems(input.dealId);
      const item = items.find((i) => i.id === input.itemId);
      const fromValue = item?.status ?? "Under Review";
      await updateItemStatus(input.itemId, input.dealId, input.status);
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "status_changed", {
        itemId: input.itemId,
        fromValue,
        toValue: input.status,
        metadata: item?.title,
      });
      return { success: true };
    }),

  updateNotes: protectedProcedure
    .input(z.object({ itemId: z.number(), dealId: z.number(), notes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot edit notes" });
      await updateItemNotes(input.itemId, input.dealId, input.notes);
      return { success: true };
    }),

  setDeadline: protectedProcedure
    .input(z.object({ itemId: z.number(), dealId: z.number(), deadline: z.string().nullable(), assigneeUserId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const deadline = input.deadline ? new Date(input.deadline) : null;
      await updateItemDeadline(input.itemId, input.dealId, deadline, input.assigneeUserId);
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "deadline_set", {
        itemId: input.itemId,
        toValue: input.deadline ?? "cleared",
      });
      return { success: true };
    }),

  updateTitle: protectedProcedure
    .input(z.object({ itemId: z.number(), dealId: z.number(), title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer" || accessRole === "editor") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to rename items" });
      await updateItemTitle(input.itemId, input.dealId, input.title);
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "item_renamed", {
        itemId: input.itemId,
        toValue: input.title,
      });
      return { success: true };
    }),

  updateParty: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      dealId: z.number(),
      party: z.enum(["buyer_counsel", "seller_counsel", "bank", "all", "other"]).optional().default("all"),
      partyLabel: z.string().optional(),
      partyCustom: z.string().optional(),
      partiesJson: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer" || accessRole === "editor") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to change party assignments" });
      await updateItemParty(input.itemId, input.dealId, input.party, input.partyLabel, input.partyCustom, input.partiesJson);
      const label = input.partiesJson
        ? (JSON.parse(input.partiesJson) as string[]).join(", ")
        : (input.party === "other" ? (input.partyCustom ?? "Other") : (input.partyLabel ?? input.party));
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "party_changed", {
        itemId: input.itemId,
        toValue: label,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ itemId: z.number(), dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer" || accessRole === "editor") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to delete items" });
      await deleteChecklistItem(input.itemId, input.dealId);
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "item_deleted", { itemId: input.itemId });
      return { success: true };
    }),
});

// ─── Chat ─────────────────────────────────────────────────────────────────────

const chatRouter = router({
  history: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .query(({ input }) => getChatHistory(input.dealId)),

  send: protectedProcedure
    .input(z.object({ dealId: z.number(), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });

      const items = await getChecklistItems(input.dealId);
      const history = await getChatHistory(input.dealId);
      const dealDocuments = await getDocuments(input.dealId);
      const todayMs = Date.now();
      const todayStr = new Date(todayMs).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const closingDateStr = deal.closingDate
        ? new Date(deal.closingDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "not set";
      const daysToClosing = deal.closingDate
        ? Math.ceil((new Date(deal.closingDate).getTime() - todayMs) / 86400000)
        : null;

      // Helper: resolve responsible party label for an item
      const getPartyLabel = (i: typeof items[0]) => {
        if (i.partiesJson) {
          try {
            const arr: string[] = JSON.parse(i.partiesJson);
            if (arr.some((p) => p.toLowerCase() === "all parties")) return "All Parties";
            return arr.join(", ");
          } catch { /* ignore */ }
        }
        return i.partyLabel ?? i.partyCustom ?? i.party ?? "unassigned";
      };

      const checklistSummary = items
        .map((i) => {
          const daysInStatus = i.statusChangedAt
            ? Math.floor((todayMs - i.statusChangedAt) / 86400000)
            : null;
          const parties = getPartyLabel(i);
          const tsNote = daysInStatus !== null ? ` [in this status for ${daysInStatus}d]` : "";
          const partyNote = parties ? ` [responsible: ${parties}]` : "";
          return `[id:${i.id}][${i.section.replace(/_/g, " ")}] ${i.title}: ${i.status}${tsNote}${partyNote}${i.notes ? ` (Note: ${i.notes})` : ""}`;
        })
        .join("\n");

      // ── Step 1: Intent detection ──────────────────────────────────────────
      const intentPrompt = `You are a legal AI assistant. The user sent this message about a deal closing checklist:
"${input.message}"

Here are the current checklist items (each prefixed with its numeric id):
${checklistSummary}

Determine the intent of the message in relation to the deal closing checklist.
Valid statuses: "Executed", "Under Review", "Outstanding", "Waived".

Respond with JSON only, no markdown, matching this exact schema:
{
  "intent": "status_change" | "item_status_query" | "item_duration_query" | "duration_threshold_query" | "status_filter_query" | "clarification_needed" | "not_found" | "party_summary" | "party_comparison" | "email_draft" | "document_summary" | "document_question" | "document_defined_terms" | "document_party_obligations" | "none",
  "matchedItemIds": [<number>],
  "newStatus": "Executed" | "Under Review" | "Outstanding" | "Waived" | null,
  "filterStatus": "Executed" | "Under Review" | "Outstanding" | "Waived" | null,
  "candidateItems": [{"id": <number>, "title": "<string>", "party": "<string>"}],
  "notFoundReference": "<string or null>",
  "partyName": "<string or null>",
  "durationThresholdDays": <number or null>,
  "durationFilterStatus": "Executed" | "Under Review" | "Outstanding" | "Waived" | null,
  "emailPartyName": "<string or null>",
  "emailItemTitles": ["<string>"] or null,
  "documentFilename": "<string or null>",
  "partyNames": ["<string>"] or null
}

Rules:
- If the message clearly implies a status change AND exactly one item matches: intent="status_change", matchedItemIds=[that id], newStatus=the implied status.
- If the message is asking about the current status of a specific named item (e.g. "What is the status of the Board approval?", "Has the SPA been signed?", "Where are we with the regulatory clearance?", "Is the board consent done?"): intent="item_status_query", matchedItemIds=[the matching item id]. If exactly one item matches clearly, set matchedItemIds=[that id]. If multiple items could match, set intent="clarification_needed" instead. If no item matches, set intent="not_found".
- If the message asks to see or list ALL items with a particular status across the whole checklist (e.g. "Show me all items that are Under Review", "What is still outstanding?", "List all executed items", "Which items have been waived?", "What's under review?"): intent="status_filter_query", filterStatus=the requested status ("Under Review", "Outstanding", "Executed", or "Waived").
- If multiple items could match (ambiguous): intent="clarification_needed", matchedItemIds=[], candidateItems=[all matching items with id/title/party].
- If the message implies a status change or specific item status query but no item matches: intent="not_found", notFoundReference=what the user referenced.
- If the message asks about outstanding, under review, or remaining items assigned to or owned by a specific named party (e.g. "What does BlackStone Ridge still need to do?", "Show me all items for Buyer Counsel", "What is outstanding for [party name]?"): intent="party_summary", partyName=the party name exactly as mentioned by the user.
- If the message asks to compare the outstanding or remaining obligations of two or more named parties (e.g. "Compare what Allen & Overy and Slaughter and May still owe", "Show me a comparison of Buyer Counsel and Seller Counsel's outstanding items", "Compare the outstanding items for Party A and Party B", "What does each party still have to do?", "How do the outstanding items compare between X and Y?"): intent="party_comparison", partyNames=[the party names exactly as mentioned by the user, as an array of strings].
- If the message asks how long a specific named item has been in its current status (e.g. "How long has the management warranties deed been under review?", "How many days has the board approval been outstanding?"): intent="item_duration_query", matchedItemIds=[the matching item id]. If multiple items could match, set intent="clarification_needed". If no item matches, set intent="not_found".
- If the message asks which items have been in a given status for more than N days (e.g. "Which items have been outstanding for more than 3 days?", "Show me everything that has been under review for over a week?"): intent="duration_threshold_query", durationThresholdDays=N (as a number), durationFilterStatus=the status mentioned ("Under Review", "Outstanding", "Executed", or "Waived"). If no status is specified, durationFilterStatus=null (match all statuses).
- If the message asks for a summary, overview, or brief description of an uploaded document (e.g. "Summarise the CMA clearance letter", "Give me an overview of the SPA", "What is in the board consent?", "Can you summarise the uploaded document?", "Summarise the document", "What does this document say?"): intent="document_summary", documentFilename=the filename or document name mentioned by the user (or null if no specific document is named).
- If the message asks a specific factual question about an uploaded document — such as asking about parties, dates, conditions, obligations, clearances, consents, or any other specific content within a document (e.g. "Who are the parties named in this document?", "What date was it signed?", "Does it confirm clearance?", "What conditions are attached?", "Who signed on behalf of the buyer?", "What is the effective date?", "Does this document mention a longstop date?"): intent="document_question", documentFilename=the filename or document name mentioned by the user (or null if no specific document is named). NOTE: Use document_question for targeted factual questions about document content, and document_summary for requests for a full overview or summary.
- If the message asks Clark to extract, list, identify, or show all defined terms or definitions from an uploaded document (e.g. "Extract all defined terms", "List the definitions in this document", "What terms are defined in the SPA?", "Show me the definitions", "What is defined in this document?", "Pull out all the defined terms", "Give me the glossary"): intent="document_defined_terms", documentFilename=the filename or document name mentioned by the user (or null if no specific document is named).
- If the message asks Clark to identify, list, or summarise the obligations, rights, or responsibilities of parties in an uploaded document (e.g. "What are the obligations of each party?", "What does the Buyer have to do?", "List the Seller's responsibilities", "What rights does the Target have?", "Show me each party's obligations", "What are the parties' obligations under this agreement?", "What is the Buyer responsible for?"): intent="document_party_obligations", documentFilename=the filename or document name mentioned by the user (or null if no specific document is named), partyName=the specific party name mentioned by the user if the question focuses on a single party (e.g. "Buyer", "Seller", "Target") or null if the question asks about all parties.
- If the message asks to draft, write, or compose a chaser email, follow-up email, or reminder email to a specific named party (e.g. "Draft a chaser email to Slaughter and May about their outstanding items", "Write a follow-up email to BlackStone Ridge", "Compose a reminder to Buyer Counsel"): intent="email_draft", emailPartyName=the party name exactly as mentioned by the user. If the message names specific items to include (e.g. "Draft a chaser to Slaughter and May about the SPA and the board approval"), set emailItemTitles=["SPA", "board approval"] with the item names exactly as mentioned. If no specific items are mentioned, set emailItemTitles=null (include all outstanding/under-review items for that party).
- If the message is a general question or does not match any of the above intents: intent="none".
- For "done", "signed", "cleared", "came through", "completed", "received" => newStatus="Executed".
- For "still outstanding", "not yet", "hasn't come through", "waiting" => newStatus="Outstanding".
- For "under review", "being reviewed", "in progress", "awaiting" => newStatus="Under Review".
- For "waived", "not required", "dropped" => newStatus="Waived".
- Match items by fuzzy title similarity — abbreviations, partial names, and synonyms should match.
- IMPORTANT: Distinguish between a status query (asking what the status IS) and a status change (implying the status SHOULD BE updated). "What is the status of X?" is a query. "X is done" is a change.
- IMPORTANT: Distinguish between status_filter_query (asking about ALL items with a status) and item_status_query (asking about ONE specific named item).`;

      let statusUpdate: { itemId: number; newStatus: string; itemTitle: string; itemParty: string; section: string } | null = null;
      let intentResult: { intent: string; matchedItemIds: number[]; newStatus: string | null; filterStatus: string | null; candidateItems: Array<{id:number;title:string;party:string}>; notFoundReference: string | null; partyName: string | null; durationThresholdDays: number | null; durationFilterStatus: string | null;  emailPartyName: string | null; emailItemTitles: string[] | null; documentFilename: string | null; partyNames: string[] | null } = { intent: "none", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null, partyNames: null };
      try {
        const intentResponse = await invokeLLM({
          messages: [{ role: "user" as const, content: intentPrompt }],
          response_format: { type: "json_object" },
        });
        const rawIntent = intentResponse.choices[0]?.message?.content;
        const intentStr = typeof rawIntent === "string" ? rawIntent : Array.isArray(rawIntent) ? (rawIntent as Array<{type:string;text?:string}>).find(c=>c.type==="text")?.text ?? "{}" : "{}";
        intentResult = JSON.parse(intentStr);
      } catch {
        // If intent detection fails, fall through to normal chat
      }

      // ── Step 1.5: Detect and block bulk updates ──────────────────────────
      const bulkUpdateKeywords = ["all", "everything", "every", "entire", "whole", "mark all", "move all", "update all", "change all"];
      const hasBulkKeyword = bulkUpdateKeywords.some(kw => input.message.toLowerCase().includes(kw));
      const isBulkStatusChange = intentResult.intent === "status_change" && (intentResult.matchedItemIds?.length === 0 || intentResult.matchedItemIds?.length === items.length) && hasBulkKeyword;

      if (isBulkStatusChange && intentResult.newStatus) {
        const bulkDeclineReply = `I cannot process bulk status updates for all items simultaneously. Each item must be confirmed individually to maintain accuracy and accountability in the deal closing process.\n\nPlease specify which individual items you would like updated to ${intentResult.newStatus}. You can reference them by name or describe which specific items need attention.`;
        await saveChatMessage(input.dealId, "user", input.message);
        await saveChatMessage(input.dealId, "assistant", bulkDeclineReply);
        return { reply: bulkDeclineReply, statusUpdate: null };
      }

      // ── Step 2: Execute status change if unambiguous ──────────────────────
      if (intentResult.intent === "status_change" && intentResult.matchedItemIds?.length === 1 && intentResult.newStatus) {
        const targetId = intentResult.matchedItemIds[0];
        const targetItem = items.find((i) => i.id === targetId);
        if (targetItem) {
          await updateItemStatus(targetId, input.dealId, intentResult.newStatus as "Executed" | "Under Review" | "Outstanding" | "Waived");
          await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "status_changed", {
            itemId: targetId,
            fromValue: targetItem.status,
            toValue: intentResult.newStatus,
          });
          statusUpdate = {
            itemId: targetId,
            newStatus: intentResult.newStatus,
            itemTitle: targetItem.title,
            itemParty: getPartyLabel(targetItem),
            section: targetItem.section,
          };
        }
      }

      // ── Step 3: Compute downstream impact ────────────────────────────────
      const updatedItems = statusUpdate ? await getChecklistItems(input.dealId) : items;
      const cpBlockers = updatedItems.filter((i) => i.section === "conditions_precedent" && (i.status === "Outstanding" || i.status === "Under Review"));
      const cpOutstanding = cpBlockers.length;
      const cpUnderReview = cpBlockers.filter((i) => i.status === "Under Review");
      const cpOutstandingItems = cpBlockers.filter((i) => i.status === "Outstanding");
      const buildStatusGroupedList = (underReview: typeof cpBlockers, outstanding: typeof cpBlockers): string => {
        const fmt = (i: (typeof cpBlockers)[0]) => {
          const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
          const party = getPartyLabel(i);
          return `- ${i.title} [${daysInStatus !== null ? `${daysInStatus}d` : "?"}] — ${party}`;
        };
        const parts: string[] = [];
        if (underReview.length > 0) parts.push(underReview.map(fmt).join("\n"));
        if (outstanding.length > 0) parts.push(outstanding.map(fmt).join("\n"));
        return parts.join("\n");
      };
      const cpBlockerList = buildStatusGroupedList(cpUnderReview, cpOutstandingItems);
      const cpHeadingCounts = cpBlockers.length > 0 ? `${cpUnderReview.length} Under Review, ${cpOutstandingItems.length} Outstanding` : "";
      const tdBlockers = updatedItems.filter((i) => i.section === "transaction_documents" && (i.status === "Outstanding" || i.status === "Under Review"));
      const tdUnderReview = tdBlockers.filter((i) => i.status === "Under Review");
      const tdOutstandingItems = tdBlockers.filter((i) => i.status === "Outstanding");
      const tdBlockerList = buildStatusGroupedList(tdUnderReview, tdOutstandingItems);
      const tdHeadingCounts = tdBlockers.length > 0 ? `${tdUnderReview.length} Under Review, ${tdOutstandingItems.length} Outstanding` : "";
      const tdExecuted = updatedItems.filter((i) => i.section === "transaction_documents").every((i) => i.status === "Executed" || i.status === "Waived");
      const pcBlockers = updatedItems.filter((i) => i.section === "post_closing" && (i.status === "Outstanding" || i.status === "Under Review"));
      const pcUnderReview = pcBlockers.filter((i) => i.status === "Under Review");
      const pcOutstandingItems = pcBlockers.filter((i) => i.status === "Outstanding");
      const pcBlockerList = buildStatusGroupedList(pcUnderReview, pcOutstandingItems);
      const pcHeadingCounts = pcBlockers.length > 0 ? `${pcUnderReview.length} Under Review, ${pcOutstandingItems.length} Outstanding` : "";
      // Executed item lists for each section
      const fmtExecuted = (i: (typeof updatedItems)[0]) => {
        const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
        const party = getPartyLabel(i);
        return `- ${i.title} [${daysInStatus !== null ? `${daysInStatus}d` : "?"}] — ${party}`;
      };
      const cpExecutedItems = updatedItems.filter((i) => i.section === "conditions_precedent" && i.status === "Executed");
      const tdExecutedItems = updatedItems.filter((i) => i.section === "transaction_documents" && i.status === "Executed");
      const pcExecutedItems = updatedItems.filter((i) => i.section === "post_closing" && i.status === "Executed");
      const cpExecutedList = cpExecutedItems.map(fmtExecuted).join("\n");
      const tdExecutedList = tdExecutedItems.map(fmtExecuted).join("\n");
      const pcExecutedList = pcExecutedItems.map(fmtExecuted).join("\n");
      const totalDone = updatedItems.filter((i) => i.status === "Executed" || i.status === "Waived").length;
      const totalItems2 = updatedItems.length;
      const progressPct = totalItems2 > 0 ? Math.round((totalDone / totalItems2) * 100) : 0;

      // ── Step 4: Build context for the main LLM call ───────────────────────
      const buildSectionSummary = (section: string, label: string) => {
        const sectionItems = updatedItems.filter((i) => i.section === section);
        if (sectionItems.length === 0) return `${label}:\n  (no items)`;
        return `${label} (${sectionItems.length} items):\n` + sectionItems
          .map((i) => {
            const daysInStatus = i.statusChangedAt
              ? Math.floor((todayMs - i.statusChangedAt) / 86400000)
              : null;
            const parties = getPartyLabel(i);
            const tsNote = daysInStatus !== null ? `, ${daysInStatus}d in status` : "";
            const partyNote = parties ? `, responsible: ${parties}` : "";
            const notesNote = i.notes ? `, notes: ${i.notes}` : "";
            return `  [id:${i.id}] ${i.title} — ${i.status}${tsNote}${partyNote}${notesNote}`;
          })
          .join("\n");
      };
      const updatedSummary = [
        buildSectionSummary("conditions_precedent", "CONDITIONS PRECEDENT"),
        buildSectionSummary("transaction_documents", "TRANSACTION DOCUMENTS"),
        buildSectionSummary("post_closing", "POST-CLOSING"),
      ].join("\n\n");

      // Build uploaded documents context for Clark
      const processedDocs = dealDocuments.filter((d) => d.aiProcessed && d.extractedText);
      const uploadedDocsContext = processedDocs.length > 0
        ? `\n\nUPLOADED DOCUMENTS (${processedDocs.length} document${processedDocs.length !== 1 ? "s" : ""} available for reference):\n` +
          processedDocs.map((d, idx) =>
            `--- DOCUMENT ${idx + 1}: ${d.filename} ---\n${d.extractedText}\n--- END DOCUMENT ${idx + 1} ---`
          ).join("\n\n")
        : "";

      const actionContext = statusUpdate
        ? `\n\nACTION ALREADY TAKEN: You have already updated "${statusUpdate.itemTitle}" to ${statusUpdate.newStatus}. Confirm this to the user in plain English, then provide the downstream impact using the structure below.

DOWNSTREAM IMPACT — YOU MUST FOLLOW THIS STRUCTURE EXACTLY AND INCLUDE ALL THREE SECTIONS. IMPORTANT: The counts below are authoritative — they were computed by the system and are guaranteed to match the number of items listed. You MUST reproduce these counts verbatim. Do NOT recount, do NOT recalculate, do NOT paraphrase the numbers. Do NOT use advisory or urgency labels such as "critical blockers" or "required at closing" in any section heading.
1. CONDITIONS PRECEDENT — ${cpBlockers.length > 0 ? cpHeadingCounts : "all clear"} (SYSTEM COUNT: ${cpBlockers.length}): ${cpBlockers.length > 0 ? `List all ${cpBlockers.length} items below, grouped by status exactly as provided. Under Review items first, then Outstanding items. Do not merge the two groups.\n${cpBlockerList}\nYOU MUST LIST EVERY SINGLE ONE OF THE ABOVE ${cpBlockers.length} CPs BY NAME AND RESPONSIBLE PARTY. Do not summarise, do not stop after the first item.` : "All conditions precedent have been satisfied or waived — there are no outstanding or under review items in this section."}
2. TRANSACTION DOCUMENTS — ${tdBlockers.length > 0 ? tdHeadingCounts : "all clear"} (SYSTEM COUNT: ${tdBlockers.length}): ${tdBlockers.length === 0 ? "All transaction documents are executed or waived — there are no outstanding or under review items in this section." : `List all ${tdBlockers.length} items below, grouped by status exactly as provided. Under Review items first, then Outstanding items. Do not merge the two groups.\n${tdBlockerList}`}
3. POST-CLOSING — ${pcBlockers.length > 0 ? pcHeadingCounts : "all clear"} (SYSTEM COUNT: ${pcBlockers.length}): ${pcBlockers.length > 0 ? `List all ${pcBlockers.length} items below, grouped by status exactly as provided. Under Review items first, then Outstanding items. Do not merge the two groups.\n${pcBlockerList}` : "All post-closing items are complete or waived — there are no outstanding or under review items in this section."}
4. OVERALL PROGRESS: ${progressPct}% complete (${totalDone} of ${totalItems2} items executed or waived).`
        : intentResult.intent === "clarification_needed"
        ? `\n\nAMBIGUITY DETECTED: The user's message could refer to multiple items. Ask for clarification without making any changes. The candidates are: ${(intentResult.candidateItems ?? []).map((c) => `"${c.title}" (assigned to ${c.party})`).join("; ")}.`
        : intentResult.intent === "email_draft" && intentResult.emailPartyName
        ? (() => {
            const eName = intentResult.emailPartyName!;
            const requestedTitles: string[] | null = intentResult.emailItemTitles && intentResult.emailItemTitles.length > 0 ? intentResult.emailItemTitles : null;

            // All outstanding/under-review items for this party
            const partyItems = updatedItems.filter((i) => {
              const label = getPartyLabel(i).toLowerCase();
              const query = eName.toLowerCase();
              return (i.status === "Outstanding" || i.status === "Under Review") && (label.includes(query) || query.includes(label));
            });

            // If specific items were requested, filter to those; track unmatched titles
            let eItems = partyItems;
            const unmatchedTitles: string[] = [];
            if (requestedTitles) {
              eItems = [];
              for (const reqTitle of requestedTitles) {
                const reqLower = reqTitle.toLowerCase();
                // Fuzzy match: item title contains the requested string or vice versa
                const matched = updatedItems.find((i) =>
                  i.title.toLowerCase().includes(reqLower) || reqLower.includes(i.title.toLowerCase())
                );
                if (matched) {
                  if (!eItems.find((x) => x.id === matched.id)) eItems.push(matched);
                } else {
                  unmatchedTitles.push(reqTitle);
                }
              }
            }

            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "Conditions Precedent" },
              { key: "transaction_documents", label: "Transaction Documents" },
              { key: "post_closing", label: "Post-Closing" },
            ];
            const fmtEmail = (i: typeof updatedItems[0]) => {
              const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
              return `  - ${i.title} [${i.status}${daysInStatus !== null ? `, ${daysInStatus} day${daysInStatus !== 1 ? "s" : ""} in status` : ""}]`;
            };
            const sectionBlocks = sections.map(({ key, label }) => {
              const sItems = eItems.filter((i) => i.section === key);
              if (sItems.length === 0) return null;
              return `${label}:\n${sItems.map(fmtEmail).join("\n")}`;
            }).filter(Boolean).join("\n\n");
            const closingDateForEmail = deal.closingDate
              ? new Date(deal.closingDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "[closing date TBC]";
            const scopeNote = requestedTitles
              ? `The lawyer has requested that only the following specific items be included: ${requestedTitles.join(", ")}. ${unmatchedTitles.length > 0 ? `NOTE: The following requested items could not be matched on the checklist and must be flagged in the email: ${unmatchedTitles.join(", ")}.` : "All requested items have been matched."}`
              : `Include all outstanding and under review items assigned to ${eName}.`;
            return `\n\nEMAIL DRAFT REQUEST: The lawyer has asked you to draft a professional chaser email to "${eName}" about items on this deal. ${scopeNote} Draft the email below. IMPORTANT RULES FOR THE EMAIL DRAFT:\n1. Begin with a clear subject line in the format: Subject: [Deal name] — Outstanding Items for Attention\n2. Address the email to ${eName}\n3. Opening paragraph: reference the deal name, the target closing date (${closingDateForEmail}), and the number of days remaining (${daysToClosing !== null ? daysToClosing + " days" : "TBC"})\n4. List the items grouped by section exactly as provided below\n5. If any requested items could not be matched on the checklist, note this clearly in the email body\n6. Closing paragraph: request an update by return and state that timely resolution is required to keep the transaction on track for closing\n7. Sign off professionally (e.g. "Yours sincerely," followed by a placeholder for the lawyer's name and firm)\n8. Write in the professional legal tone of a senior associate at a Magic Circle law firm — precise, direct, and formal\n9. Do NOT send the email — this is a draft for the lawyer to review\n10. Label the output clearly as DRAFT EMAIL\n\nItems to include (${eItems.length} item${eItems.length !== 1 ? "s" : ""}):\n${eItems.length > 0 ? sectionBlocks : "No matching items found for the specified criteria."}\n\nDeal: ${deal.name} | Closing: ${closingDateForEmail} | ${daysToClosing !== null ? daysToClosing + " days remaining" : "closing date TBC"}`;
          })()
        : intentResult.intent === "not_found"
        ? `\n\nITEM NOT FOUND: The user referenced "${intentResult.notFoundReference}" but no matching item exists on the checklist. Tell the user clearly and offer to add it as a new item.`
        : intentResult.intent === "status_filter_query" && intentResult.filterStatus
        ? (() => {
            const fs = intentResult.filterStatus!;
            const validStatuses = ["Executed", "Under Review", "Outstanding", "Waived"];
            const normalisedStatus = validStatuses.find((s) => s.toLowerCase() === fs.toLowerCase()) ?? fs;
            const matchingItems = updatedItems.filter((i) => i.status === normalisedStatus);
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "CONDITIONS PRECEDENT" },
              { key: "transaction_documents", label: "TRANSACTION DOCUMENTS" },
              { key: "post_closing", label: "POST-CLOSING" },
            ];
            const fmt = (i: typeof updatedItems[0]) => {
              const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
              const party = getPartyLabel(i);
              return `- "${i.title}"${daysInStatus !== null ? ` [${daysInStatus}d in status]` : ""} — responsible: ${party}`;
            };
            const sectionBlocks = sections.map(({ key, label }) => {
              const sItems = matchingItems.filter((i) => i.section === key);
              if (sItems.length === 0) {
                return `${label}: No items with status "${normalisedStatus}" in this section.`;
              }
              return `${label} (${sItems.length} item${sItems.length !== 1 ? "s" : ""}):\n${sItems.map(fmt).join("\n")}`;
            }).join("\n\n");
            return `\n\nSTATUS FILTER QUERY: The lawyer asked to see all items with status "${normalisedStatus}". Present the information below exactly as structured, grouped by section. For each section with no matching items, explicitly state that. Do NOT omit any section.\n\nTotal items with status "${normalisedStatus}": ${matchingItems.length}\n\n${sectionBlocks}`;
          })()
        : intentResult.intent === "item_status_query" && intentResult.matchedItemIds?.length === 1
        ? (() => {
            const targetId = intentResult.matchedItemIds[0]!;
            const item = updatedItems.find((i) => i.id === targetId);
            if (!item) return `\n\nITEM NOT FOUND: The referenced item (id ${targetId}) could not be located. Tell the user clearly.`;
            const daysInStatus = item.statusChangedAt ? Math.floor((todayMs - item.statusChangedAt) / 86400000) : null;
            const party = getPartyLabel(item);
            const sectionLabel = item.section.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const deadlineStr = item.deadline ? `Deadline: ${new Date(item.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "No deadline set";
            const notesStr = item.notes ? `Notes: ${item.notes}` : "No notes recorded";
            return `\n\nITEM STATUS QUERY: The lawyer asked about the status of a specific item. Present the following information factually and precisely. Do NOT speculate or add information not provided here.\n\nItem: "${item.title}"\nSection: ${sectionLabel}\nCurrent status: ${item.status}${daysInStatus !== null ? ` (in this status for ${daysInStatus} day${daysInStatus !== 1 ? "s" : ""})` : ""}\nResponsible party: ${party}\n${deadlineStr}\n${notesStr}`;
          })()
        : intentResult.intent === "item_duration_query" && intentResult.matchedItemIds?.length === 1
        ? (() => {
            const targetId = intentResult.matchedItemIds[0]!;
            const item = updatedItems.find((i) => i.id === targetId);
            if (!item) return `\n\nITEM NOT FOUND: The referenced item (id ${targetId}) could not be located. Tell the user clearly.`;
            const daysInStatus = item.statusChangedAt ? Math.floor((todayMs - item.statusChangedAt) / 86400000) : null;
            const sinceDate = item.statusChangedAt
              ? new Date(item.statusChangedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : null;
            const party = getPartyLabel(item);
            const sectionLabel = item.section.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return `\n\nITEM DURATION QUERY: The lawyer asked how long a specific item has been in its current status. Present the following information factually and precisely.\n\nItem: "${item.title}"\nSection: ${sectionLabel}\nCurrent status: ${item.status}\nDuration in current status: ${daysInStatus !== null ? `${daysInStatus} day${daysInStatus !== 1 ? "s" : ""}` : "unknown (no status timestamp recorded)"}\nStatus last changed: ${sinceDate ?? "unknown"}\nResponsible party: ${party}\n\nYour response MUST state both the duration in days and the exact date the status was last changed. Format: "[Item name] has been [status] for [N] days since [date]."\nDo NOT speculate or add information not provided here.`;
          })()
        : intentResult.intent === "duration_threshold_query" && intentResult.durationThresholdDays !== null
        ? (() => {
            const thresholdDays = intentResult.durationThresholdDays!;
            const filterStatus = intentResult.durationFilterStatus;
            const validStatuses = ["Executed", "Under Review", "Outstanding", "Waived"];
            const normalisedFilterStatus = filterStatus
              ? validStatuses.find((s) => s.toLowerCase() === filterStatus.toLowerCase()) ?? filterStatus
              : null;
            const matchingItems = updatedItems.filter((i) => {
              if (!i.statusChangedAt) return false;
              const daysInStatus = Math.floor((todayMs - i.statusChangedAt) / 86400000);
              if (daysInStatus <= thresholdDays) return false;
              if (normalisedFilterStatus && i.status !== normalisedFilterStatus) return false;
              return true;
            });
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "CONDITIONS PRECEDENT" },
              { key: "transaction_documents", label: "TRANSACTION DOCUMENTS" },
              { key: "post_closing", label: "POST-CLOSING" },
            ];
            const fmt = (i: typeof updatedItems[0]) => {
              const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
              const sinceDate = i.statusChangedAt
                ? new Date(i.statusChangedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                : null;
              const party = getPartyLabel(i);
              return `- "${i.title}" [${i.status}, ${daysInStatus !== null ? `${daysInStatus} days` : "unknown duration"} since ${sinceDate ?? "unknown date"}] — responsible: ${party}`;
            };
            const sectionBlocks = sections.map(({ key, label }) => {
              const sItems = matchingItems.filter((i) => i.section === key);
              if (sItems.length === 0) {
                return `${label}: No items${normalisedFilterStatus ? ` with status "${normalisedFilterStatus}"` : ""} exceeding ${thresholdDays} days in this section.`;
              }
              return `${label} (${sItems.length} item${sItems.length !== 1 ? "s" : ""}):\n${sItems.map(fmt).join("\n")}`;
            }).join("\n\n");
            const statusDesc = normalisedFilterStatus ? `with status "${normalisedFilterStatus}" ` : "";
            return `\n\nDURATION THRESHOLD QUERY: The lawyer asked which items ${statusDesc}have been in their current status for more than ${thresholdDays} days. Present the information below exactly as structured, grouped by section. For each section with no matching items, explicitly state that. Do NOT omit any section.\n\nTotal items matching: ${matchingItems.length}\n\n${sectionBlocks}\n\nFor every item listed, your response MUST state both the number of days in the current status and the exact date the status was last changed.`;
          })()
        : intentResult.intent === "party_comparison" && intentResult.partyNames && intentResult.partyNames.length >= 2
        ? (() => {
            const requestedParties = intentResult.partyNames!;
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "CONDITIONS PRECEDENT" },
              { key: "transaction_documents", label: "TRANSACTION DOCUMENTS" },
              { key: "post_closing", label: "POST-CLOSING" },
            ];

            // Build per-party data
            const partyData = requestedParties.map((pName) => {
              const matchesParty = (i: typeof items[0]) => {
                const label = getPartyLabel(i).toLowerCase();
                return label.includes(pName.toLowerCase()) || pName.toLowerCase().includes(label.split(" ")[0]?.toLowerCase() ?? "");
              };
              const partyItems = updatedItems.filter((i) => (i.status === "Outstanding" || i.status === "Under Review") && matchesParty(i));
              const totalOutstanding = partyItems.filter((i) => i.status === "Outstanding").length;
              const totalUnderReview = partyItems.filter((i) => i.status === "Under Review").length;

              const sectionBlocks = sections.map(({ key, label }) => {
                const sItems = partyItems.filter((i) => i.section === key);
                const ur = sItems.filter((i) => i.status === "Under Review");
                const os = sItems.filter((i) => i.status === "Outstanding");
                if (sItems.length === 0) {
                  return `  ${label}: No outstanding or under review items.`;
                }
                const lines: string[] = [];
                if (ur.length > 0) lines.push(`    Under Review (${ur.length}): ${ur.map((i) => i.title).join("; ")}`);
                if (os.length > 0) lines.push(`    Outstanding (${os.length}): ${os.map((i) => i.title).join("; ")}`);
                return `  ${label} — ${ur.length} Under Review, ${os.length} Outstanding:\n${lines.join("\n")}`;
              }).join("\n");

              return { pName, totalOutstanding, totalUnderReview, total: partyItems.length, sectionBlocks, found: partyItems.length > 0 || updatedItems.some((i) => matchesParty(i)) };
            });

            // Summary count table
            const summaryTable = [
              `SUMMARY`,
              `Party | Outstanding | Under Review | Total`,
              ...partyData.map((p) => `${p.pName} | ${p.totalOutstanding} | ${p.totalUnderReview} | ${p.total}`),
            ].join("\n");

            // Section-by-section per party
            const partyBlocks = partyData.map((p) => {
              if (!p.found) {
                return `${p.pName.toUpperCase()}:\n  No items found assigned to "${p.pName}" in this deal's checklist. The party name may not match exactly — please check the checklist.`;
              }
              return `${p.pName.toUpperCase()} (${p.total} item${p.total !== 1 ? "s" : ""} remaining):\n${p.sectionBlocks}`;
            }).join("\n\n");

            return `\n\nPARTY COMPARISON REQUEST: The lawyer has asked to compare the outstanding obligations of the following parties: ${requestedParties.join(", ")}. Present the structured comparison below. Your response MUST follow the PARTY COMPARISON RULE in the system prompt.\n\n${summaryTable}\n\n${partyBlocks}`;
          })()
        : intentResult.intent === "party_summary" && intentResult.partyName
        ? (() => {
            const pName = intentResult.partyName!;
            // Fuzzy match: check if any word in the party label contains the searched name (case-insensitive)
            const matchesParty = (i: typeof items[0]) => {
              const label = getPartyLabel(i).toLowerCase();
              return label.includes(pName.toLowerCase()) || pName.toLowerCase().includes(label.split(" ")[0]?.toLowerCase() ?? "");
            };
            const partyItems = updatedItems.filter((i) => (i.status === "Outstanding" || i.status === "Under Review") && matchesParty(i));
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "CONDITIONS PRECEDENT" },
              { key: "transaction_documents", label: "TRANSACTION DOCUMENTS" },
              { key: "post_closing", label: "POST-CLOSING" },
            ];
            const sectionBlocks = sections.map(({ key, label }) => {
              const sItems = partyItems.filter((i) => i.section === key);
              const ur = sItems.filter((i) => i.status === "Under Review");
              const os = sItems.filter((i) => i.status === "Outstanding");
              if (sItems.length === 0) {
                return `${label} — 0 Under Review, 0 Outstanding: No outstanding or under review items assigned to ${pName} in this section.`;
              }
              const list = buildStatusGroupedList(ur, os);
              return `${label} — ${ur.length} Under Review, ${os.length} Outstanding (SYSTEM COUNT: ${sItems.length}):\n${list}`;
            }).join("\n\n");
            return `\n\nPARTY SUMMARY REQUEST: The lawyer has asked for a summary of all outstanding and under review items assigned to "${pName}". Present the information below exactly as structured, using the split-count heading format. For each section, if there are no items for this party, explicitly state that. Do NOT omit any section.\n\n${sectionBlocks}\n\nOVERALL: ${partyItems.length} item${partyItems.length !== 1 ? "s" : ""} remaining for ${pName} across all sections.`;
          })()
        : intentResult.intent === "document_summary"
        ? (() => {
            if (processedDocs.length === 0) {
              return `\n\nDOCUMENT SUMMARY REQUEST: The lawyer has asked for a document summary, but no documents have been uploaded and processed for this deal yet. Inform the lawyer that no documents are currently available and invite them to upload a document to the relevant checklist item.`;
            }
            const reqFilename = intentResult.documentFilename;
            // If a specific document was named, try to find it by fuzzy filename match
            const matchedDoc = reqFilename
              ? processedDocs.find((d) =>
                  d.filename.toLowerCase().includes(reqFilename.toLowerCase()) ||
                  reqFilename.toLowerCase().includes(d.filename.toLowerCase().replace(/\.pdf$/i, ""))
                )
              : null;
            if (reqFilename && !matchedDoc) {
              // Named document not found — list available documents
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT SUMMARY REQUEST: The lawyer asked for a summary of "${reqFilename}" but no document with that name has been uploaded. The following documents are currently available:\n${docList}\n\nAsk the lawyer to clarify which document they would like summarised.`;
            }
            if (!reqFilename && processedDocs.length > 1) {
              // No document specified and multiple are available — ask for clarification
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT SUMMARY REQUEST: The lawyer asked for a document summary but did not specify which document. The following documents are currently uploaded:\n${docList}\n\nAsk the lawyer to specify which document they would like summarised.`;
            }
            // Either a specific match was found, or there is only one document — summarise it
            const doc = matchedDoc ?? processedDocs[0]!;
            return `\n\nDOCUMENT SUMMARY REQUEST: The lawyer has asked for a summary of "${doc.filename}". Using the extracted text below, provide a concise factual overview of this document. Your summary MUST follow the DOCUMENT SUMMARY RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
          })()
        : intentResult.intent === "document_question"
        ? (() => {
            if (processedDocs.length === 0) {
              return `\n\nDOCUMENT QUESTION: The lawyer has asked a question about an uploaded document, but no documents have been uploaded and processed for this deal yet. Inform the lawyer that no documents are currently available and invite them to upload a document to the relevant checklist item.`;
            }
            const reqFilename = intentResult.documentFilename;
            // If a specific document was named, try to find it by fuzzy filename match
            const matchedDoc = reqFilename
              ? processedDocs.find((d) =>
                  d.filename.toLowerCase().includes(reqFilename.toLowerCase()) ||
                  reqFilename.toLowerCase().includes(d.filename.toLowerCase().replace(/\.pdf$/i, ""))
                )
              : null;
            if (reqFilename && !matchedDoc) {
              // Named document not found — list available documents
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT QUESTION: The lawyer asked a question about "${reqFilename}" but no document with that name has been uploaded. The following documents are currently available:\n${docList}\n\nAsk the lawyer to clarify which document they are referring to.`;
            }
            if (!reqFilename && processedDocs.length > 1) {
              // No document specified and multiple are available — ask for clarification
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT QUESTION: The lawyer has asked a question about a document but did not specify which one. The following documents are currently uploaded:\n${docList}\n\nAsk the lawyer to clarify which document their question refers to before answering.`;
            }
            // Either a specific match was found, or there is only one document — answer the question
            const doc = matchedDoc ?? processedDocs[0]!;
            return `\n\nDOCUMENT QUESTION: The lawyer has asked a specific question about "${doc.filename}". Answer the question using only the extracted text below. Your answer MUST follow the DOCUMENT QUESTION RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
          })()
        : intentResult.intent === "document_defined_terms"
        ? (() => {
            if (processedDocs.length === 0) {
              return `\n\nDOCUMENT DEFINED TERMS REQUEST: The lawyer has asked to extract defined terms from an uploaded document, but no documents have been uploaded and processed for this deal yet. Inform the lawyer that no documents are currently available and invite them to upload a document to the relevant checklist item.`;
            }
            const reqFilename = intentResult.documentFilename;
            // Fuzzy filename match
            const matchedDoc = reqFilename
              ? processedDocs.find((d) =>
                  d.filename.toLowerCase().includes(reqFilename.toLowerCase()) ||
                  reqFilename.toLowerCase().includes(d.filename.toLowerCase().replace(/\.pdf$/i, ""))
                )
              : null;
            if (reqFilename && !matchedDoc) {
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT DEFINED TERMS REQUEST: The lawyer asked to extract defined terms from "${reqFilename}" but no document with that name has been uploaded. The following documents are currently available:\n${docList}\n\nAsk the lawyer to clarify which document they would like the defined terms extracted from.`;
            }
            if (!reqFilename && processedDocs.length > 1) {
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT DEFINED TERMS REQUEST: The lawyer asked to extract defined terms but did not specify which document. The following documents are currently uploaded:\n${docList}\n\nAsk the lawyer to specify which document they would like the defined terms extracted from.`;
            }
            const doc = matchedDoc ?? processedDocs[0]!;
            return `\n\nDOCUMENT DEFINED TERMS REQUEST: The lawyer has asked to extract all defined terms from "${doc.filename}". Using the extracted text below, identify and list every defined term and its definition. Your response MUST follow the DOCUMENT DEFINED TERMS RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
          })()
        : intentResult.intent === "document_party_obligations"
        ? (() => {
            if (processedDocs.length === 0) {
              return `\n\nDOCUMENT PARTY OBLIGATIONS REQUEST: The lawyer has asked to identify party obligations from an uploaded document, but no documents have been uploaded and processed for this deal yet. Inform the lawyer that no documents are currently available and invite them to upload a document to the relevant checklist item.`;
            }
            const reqFilename = intentResult.documentFilename;
            const focusParty = intentResult.partyName ?? null;
            // Fuzzy filename match
            const matchedDoc = reqFilename
              ? processedDocs.find((d) =>
                  d.filename.toLowerCase().includes(reqFilename.toLowerCase()) ||
                  reqFilename.toLowerCase().includes(d.filename.toLowerCase().replace(/\.pdf$/i, ""))
                )
              : null;
            if (reqFilename && !matchedDoc) {
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT PARTY OBLIGATIONS REQUEST: The lawyer asked to identify party obligations from "${reqFilename}" but no document with that name has been uploaded. The following documents are currently available:\n${docList}\n\nAsk the lawyer to clarify which document they would like analysed.`;
            }
            if (!reqFilename && processedDocs.length > 1) {
              const docList = processedDocs.map((d, idx) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT PARTY OBLIGATIONS REQUEST: The lawyer asked to identify party obligations but did not specify which document. The following documents are currently uploaded:\n${docList}\n\nAsk the lawyer to specify which document they would like analysed.`;
            }
            const doc = matchedDoc ?? processedDocs[0]!;
            const partyFocusNote = focusParty
              ? `The lawyer is specifically asking about the party: "${focusParty}". Focus your analysis on that party, but mention other parties briefly if relevant.`
              : `The lawyer is asking about all parties. Identify every named party and provide a breakdown for each.`;
            return `\n\nDOCUMENT PARTY OBLIGATIONS REQUEST: The lawyer has asked to identify the obligations, rights, and responsibilities of parties in "${doc.filename}". ${partyFocusNote} Using the extracted text below, provide a structured breakdown. Your response MUST follow the DOCUMENT PARTY OBLIGATIONS RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
          })()
        : "";

      // ── Deal metadata for narrative intro ────────────────────────────────
      const dealNarrative = (() => {
        const parts: string[] = [];
        if (deal.targetCompany) parts.push(`Target company: ${deal.targetCompany}`);
        if (deal.dealStructure) parts.push(`Deal structure: ${deal.dealStructure}${deal.dealStructureOther ? ` (${deal.dealStructureOther})` : ""}`);
        if (deal.buyerName) parts.push(`Buyer: ${deal.buyerName}`);
        if (deal.sellerName) parts.push(`Seller: ${deal.sellerName}`);
        if (deal.dealValue) parts.push(`Deal value: ${deal.dealValue}`);
        if (deal.governingLaw) parts.push(`Governing law: ${deal.governingLaw}`);
        if (deal.buyerCounsel) parts.push(`Buyer's counsel: ${deal.buyerCounsel}`);
        if (deal.sellerCounsel) parts.push(`Seller's counsel: ${deal.sellerCounsel}`);
        return parts.join(" | ");
      })();

      const systemPrompt = `You are Clark, an AI legal assistant for the deal closing platform ClosingRoom. Your name is Clark. You are helping with the deal: "${deal.name}".
Today's date: ${todayStr}
Target closing date: ${closingDateStr}${daysToClosing !== null ? ` (${daysToClosing >= 0 ? daysToClosing + " days remaining" : Math.abs(daysToClosing) + " days overdue"})` : ""}
Deal metadata: ${dealNarrative || "(no additional deal metadata recorded)"}
Current closing checklist status (each item shows how long it has been in its current status and who is responsible):
${updatedSummary}
OVERALL PROGRESS: ${progressPct}% complete (${totalDone} of ${totalItems2} items executed or waived).
CHECKLIST ITEMS REFERENCE (authoritative — computed directly from the database, reproduce these verbatim when reporting on checklist items):
1. CONDITIONS PRECEDENT (outstanding/under-review: ${cpBlockers.length}, executed: ${cpExecutedItems.length})${cpBlockers.length > 0 ? `:\nItems:\n${cpBlockerList}` : ""}${cpExecutedItems.length > 0 ? `\n\nExecuted:\n${cpExecutedList}` : cpBlockers.length === 0 ? ": All conditions precedent have been satisfied or waived." : ""}
2. TRANSACTION DOCUMENTS (outstanding/under-review: ${tdBlockers.length}, executed: ${tdExecutedItems.length})${tdBlockers.length > 0 ? `:\nItems:\n${tdBlockerList}` : ""}${tdExecutedItems.length > 0 ? `\n\nExecuted:\n${tdExecutedList}` : tdBlockers.length === 0 ? ": All transaction documents are executed or waived." : ""}
3. POST-CLOSING (outstanding/under-review: ${pcBlockers.length}, executed: ${pcExecutedItems.length})${pcBlockers.length > 0 ? `:\nItems:\n${pcBlockerList}` : ""}${pcExecutedItems.length > 0 ? `\n\nExecuted:\n${pcExecutedList}` : pcBlockers.length === 0 ? ": All post-closing items are complete or waived." : ""}
Status values: Executed, Under Review, Outstanding, Waived. "Under Review" means in progress or awaiting review.
When asked about prioritisation or what to focus on, rank Outstanding and Under Review items by section and days in status:
1. Section order: Conditions Precedent first, then Transaction Documents, then Post-Closing.
2. Within each section, list Under Review items first (grouped under a subheading "Under Review"), then Outstanding items (grouped under a subheading "Outstanding"). Never merge the two statuses into a single list.
3. Days in current status: within each status group, items that have been in that status longer appear first.
4. Days to closing: note the number of days remaining as context.
For each item you present, clearly state: the item name, its current status, how long it has been in that status, and who is responsible.
CRITICAL RULE — PROGRESS PERCENTAGE: The OVERALL PROGRESS figure above is authoritative and was computed by the system as (Executed + Waived items) / total items. You MUST use this exact figure when stating the deal's completion percentage. Never calculate it yourself.
CRITICAL RULE — CHECKLIST ITEMS EXHAUSTIVE LIST: The CHECKLIST ITEMS REFERENCE above lists every item grouped by section and status. When reporting on any section, you MUST reproduce every item from this reference without omission — both outstanding/under-review items AND executed items. When asked for a full deal summary, list all three sections with both their outstanding/under-review items AND their executed items. Never add items not in this reference.

SECTION HEADING FORMAT — MANDATORY: When reporting on any section, the heading MUST show the split count of Under Review and Outstanding items separately. Use this exact format:
- "CONDITIONS PRECEDENT — N Under Review, N Outstanding" (e.g. "CONDITIONS PRECEDENT — 2 Under Review, 3 Outstanding")
- "TRANSACTION DOCUMENTS — N Under Review, N Outstanding" (e.g. "TRANSACTION DOCUMENTS — 5 Under Review, 2 Outstanding")
- "POST-CLOSING — N Under Review, N Outstanding" (e.g. "POST-CLOSING — 0 Under Review, 7 Outstanding")
If a count is zero, include it as 0 (e.g. "0 Under Review, 7 Outstanding"). Never use a combined total such as "(7 items remaining)" or "(2 items remaining)".

PHRASES THAT ARE FORBIDDEN in all responses: "must be satisfied before closing", "are required at closing", "are still outstanding or under review and must be satisfied before closing", "critical blocker", "required at closing", "urgent", "can wait", "must complete before closing", "needed at closing". Replace all such phrases with neutral factual language, for example: "The following Conditions Precedent remain" or "The following Transaction Documents remain".

Do NOT reference statutory deadlines, legislation, consequences of non-compliance, or any legal obligations in any response under any circumstances.

CRITICAL RULE — EXHAUSTIVE SECTION REPORTING: Whenever you report on deal status, outstanding items, or the result of a status update, you MUST address all three sections — Conditions Precedent, Transaction Documents, and Post-Closing — and for each section you MUST do one of the following: (a) list every outstanding or under-review item by name and responsible party, OR (b) explicitly state that the section is fully clear with a sentence such as "All conditions precedent have been satisfied or waived — there are no outstanding or under review items in this section." Silence is never acceptable as confirmation in a legal closing context. Never omit a section. Never stop after the first outstanding CP — list every single one. Never summarise with phrases like "including", "such as", or "among others". Omitting any outstanding item or silently skipping a section is a critical error in a legal closing tool.
CRITICAL RULE — COUNT ACCURACY: When the system provides a SYSTEM COUNT for a section, that count is authoritative and was computed directly from the database. You MUST use that exact number in your response heading for that section. Never recount the items yourself. Never state a number that differs from the SYSTEM COUNT. A mismatch between the count in your heading and the number of items you list is a critical error.
Answer questions about this deal concisely and professionally. Focus on deal status, outstanding items, risks, and next steps. Do not give general legal advice unrelated to this specific deal.
DEAL NARRATIVE INTRODUCTION RULE: When the lawyer asks for a full status update, a deal summary, or a general overview of the deal, you MUST begin your response with a brief factual introductory paragraph before the checklist breakdown. This paragraph must state: the deal name, deal structure, target company name (if recorded), buyer name, seller name, deal value, governing law, and target closing date. Then state the current overall progress percentage and days remaining. Example format: "[Deal name] is a [deal value] [deal structure] of [target company] by [buyer] from [seller], governed by [governing law], with a target closing date of [date]. The deal is currently [N]% complete with [N] days remaining until closing." Use only the deal metadata provided above — do not invent or assume any values. If a field is not recorded, omit it from the sentence rather than stating "unknown" or "not provided".

TONE AND CONDUCT: Communicate like a senior associate at a Magic Circle law firm — precise, confident, and direct. Never apologise unless you have genuinely made an error in a previous response in this conversation. Do not say "sorry", do not say "my apologies", do not acknowledge any oversight. When a lawyer provides new information and asks you to update the checklist, act on it immediately and confirm what you did in a confident, professional tone. Simply confirm the update and provide the downstream impact. Never hedge unnecessarily or use filler phrases.${uploadedDocsContext}

PARTY COMPARISON RULE (apply when a PARTY COMPARISON REQUEST block is present in the context):
When the lawyer asks to compare the outstanding obligations of two or more parties:
1. Begin with a SUMMARY TABLE showing each party's name, Outstanding count, Under Review count, and Total remaining items. Present this as a formatted table with clear column headers.
2. Then provide a SECTION-BY-SECTION BREAKDOWN for each party, using the data provided in the PARTY COMPARISON REQUEST block. For each party, show three sub-sections: CONDITIONS PRECEDENT, TRANSACTION DOCUMENTS, and POST-CLOSING. Under each sub-section, list the items grouped by status (Under Review first, then Outstanding). If a party has no items in a section, explicitly state: "No outstanding or under review items in this section."
3. Use the exact counts provided in the PARTY COMPARISON REQUEST block — do NOT recount.
4. If a party name was not found in the checklist, state this clearly and suggest the lawyer check the party name spelling.
5. Present the comparison in a clear, readable format with each party as a distinct block separated by a horizontal rule or clear heading.
6. Do not make legal judgments about which party's position is more or less favourable.
7. Do not omit any party named in the request, and do not omit any section for any party.

DOCUMENT READING RULES (apply whenever answering questions about uploaded documents):
1. FACTUAL OBSERVATIONS ONLY: When answering questions about an uploaded document, make only factual observations about what is present in the document — party names, dates, defined terms, conditions, whether clearance or consent appears to have been granted, and similar factual content. Never make legal judgments about whether a document is legally valid, properly executed, or sufficient to satisfy a condition precedent.
2. ALWAYS REMIND TO REVIEW: After answering any question about a document, always include this reminder: "Please review the document yourself before updating any checklist item status."
3. PROPOSE BEFORE ACTING: If the content of an uploaded document appears to evidence completion of a checklist item, do NOT automatically mark the item as Executed. Instead, ask the lawyer whether they would like you to mark it. Example: "This document appears to confirm CMA merger clearance has been granted. Would you like me to mark CMA merger clearance as Executed?" Wait for the lawyer's confirmation before taking any action.
4. SCOPE: These rules apply to all documents uploaded to any checklist item across all three sections — Conditions Precedent, Transaction Documents, and Post-Closing.

DOCUMENT SUMMARY RULE (apply when a DOCUMENT SUMMARY REQUEST is present in the context):
When asked to summarise an uploaded document, provide a concise factual overview structured as follows:
1. Document name and type (e.g. letter, agreement, consent, clearance notice)
2. Parties named in the document (list all parties identified)
3. Key dates (execution date, effective date, expiry date, or any other material dates present)
4. Subject matter and purpose (one or two sentences describing what the document is about)
5. Key terms, conditions, or obligations present (factual only — do not assess whether they are satisfied)
6. Any clearances, consents, or approvals that appear to have been granted
Do NOT assess whether the document is legally valid, properly executed, or sufficient to satisfy any condition precedent. End every document summary with: "Please review the document yourself before updating any checklist item status."

DOCUMENT QUESTION RULE (apply when a DOCUMENT QUESTION block is present in the context):
When answering a specific follow-up question about an uploaded document:
1. Answer only the specific question asked, using only the content of the document provided in the DOCUMENT QUESTION block.
2. Be precise and direct — quote or closely paraphrase the relevant part of the document where possible.
3. If the answer cannot be determined from the document text, say so clearly: "The document does not appear to contain this information."
4. Never speculate or infer information that is not explicitly present in the document.
5. Never make legal judgments about whether a document is legally valid, properly executed, or sufficient to satisfy any condition precedent.
6. End every answer with: "Please review the document yourself before updating any checklist item status."

DOCUMENT DEFINED TERMS RULE (apply when a DOCUMENT DEFINED TERMS REQUEST block is present in the context):
When extracting defined terms from an uploaded document:
1. Identify every term that is explicitly defined in the document. This includes:
   a. Terms defined in a dedicated definitions section or schedule (e.g. "Definitions", "Interpretation", "Schedule of Definitions").
   b. Capitalised terms defined inline using language such as "means", "shall mean", "refers to", "is defined as", or similar.
   c. Terms introduced in quotation marks or parentheses immediately following a definition (e.g. (the "Buyer")).
2. Present the results as a structured list in alphabetical order. For each entry, show the defined term in bold followed by its definition exactly as it appears in the document.
3. If a term is defined in multiple places, include the primary definition and note that it appears elsewhere.
4. If no defined terms can be identified in the document, say so clearly: "No explicitly defined terms were found in this document."
5. Never infer or fabricate definitions that are not present in the document text.
6. Never make legal judgments about whether the definitions are adequate, enforceable, or consistent with market practice.
7. End the response with: "Please review the document yourself before updating any checklist item status."

DOCUMENT PARTY OBLIGATIONS RULE (apply when a DOCUMENT PARTY OBLIGATIONS REQUEST block is present in the context):
When identifying obligations, rights, and responsibilities of parties in an uploaded document:
1. First, identify every named party in the document (e.g. Buyer, Seller, Target, Guarantor, Lender).
2. For each party (or the specific party named in the request), provide a structured breakdown with three sub-sections:
   a. OBLIGATIONS — actions the party MUST or SHALL perform (use of "must", "shall", "will", "is required to", "undertakes to", "agrees to").
   b. RIGHTS — actions the party MAY take or entitlements it has (use of "may", "is entitled to", "has the right to", "shall be permitted to", "at its option").
   c. RESPONSIBILITIES — things the party is accountable for (use of "is responsible for", "shall procure", "shall ensure", "shall cause", "shall maintain").
3. For each item, quote or closely paraphrase the relevant clause or provision from the document.
4. If a party has no identified obligations, rights, or responsibilities in a sub-section, state that explicitly.
5. If a specific party was named in the request, focus on that party but briefly note the other parties identified in the document.
6. Never make legal judgments about whether obligations are enforceable, onerous, or consistent with market practice.
7. Never infer obligations, rights, or responsibilities that are not explicitly stated in the document.
8. End the response with: "Please review the document yourself before updating any checklist item status."

BULK STATUS UPDATE PREVENTION RULE:
You MUST NEVER process bulk status updates that attempt to change the status of all items (or all items in a section) to a single status in one command. This includes requests phrased as:
- "Mark all items as Executed"
- "Move everything to Executed"
- "Set all outstanding items to Waived"
- "Change all items in Post-Closing to Executed"
- "Execute all items" or similar variations

When you receive any such bulk update request, you MUST:
1. Decline the request clearly and explain why
2. State that each item must be updated individually to maintain accuracy and accountability on the closing checklist
3. Ask the lawyer to specify which individual items they would like you to update
4. Wait for the lawyer to provide specific item names or a more granular request

Example response: "I cannot mark all items as Executed in a single command. Each item must be updated individually to maintain accuracy and accountability on the closing checklist. Please tell me which specific item you would like me to update and I will action it immediately."

This rule applies regardless of how the bulk update request is phrased or what status is requested.${actionContext}`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...history.slice(-40).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: input.message },
      ];
      const response = await invokeLLM({ messages });
      const rawContent = response.choices[0]?.message?.content;
      const reply = typeof rawContent === "string" ? rawContent : Array.isArray(rawContent) ? (rawContent as Array<{type:string;text?:string}>).find(c=>c.type==="text")?.text ?? "I could not generate a response." : "I could not generate a response.";
      await saveChatMessage(input.dealId, "user", input.message);
      await saveChatMessage(input.dealId, "assistant", reply);
      return { reply, statusUpdate: statusUpdate ? { itemId: statusUpdate.itemId, newStatus: statusUpdate.newStatus } : null };
    }),
});

// ─── Conversation Threads ────────────────────────────────────────────────────────

const threadsRouter = router({
  list: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      return getConversationThreads(input.dealId);
    }),

  create: protectedProcedure
    .input(z.object({ dealId: z.number(), title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const threadId = await createConversationThread(input.dealId, ctx.user.id, input.title);
      return { threadId };
    }),

  updateTitle: protectedProcedure
    .input(z.object({ dealId: z.number(), threadId: z.number(), title: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      await updateConversationThreadTitle(input.threadId, input.dealId, input.title);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ dealId: z.number(), threadId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteConversationThread(input.threadId, input.dealId);
      return { success: true };
    }),

  messages: protectedProcedure
    .input(z.object({ threadId: z.number() }))
    .query(({ input }) => getConversationMessages(input.threadId)),

  sendMessage: protectedProcedure
    .input(z.object({ dealId: z.number(), threadId: z.number(), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const thread = await getConversationThreads(input.dealId);
      const currentThread = thread.find((t: any) => t.id === input.threadId);
      if (!currentThread) throw new TRPCError({ code: "NOT_FOUND", message: "Thread not found" });

      // Save user message
      await saveConversationMessage(input.threadId, "user", input.message);

      // Auto-title the thread from the first message if no title is set yet
      if (!currentThread.title) {
        const existingMessages = await getConversationMessages(input.threadId);
        // Only auto-title if this is the first (or only) user message
        const userMessages = existingMessages.filter((m: any) => m.role === "user");
        if (userMessages.length <= 1) {
          const raw = input.message.trim();
          const maxLen = 60;
          let autoTitle: string;
          if (raw.length <= maxLen) {
            autoTitle = raw;
          } else {
            // Truncate at last word boundary before maxLen
            const truncated = raw.slice(0, maxLen);
            const lastSpace = truncated.lastIndexOf(" ");
            autoTitle = (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "...";
          }
          await updateConversationThreadTitle(input.threadId, input.dealId, autoTitle);
        }
      }

      // Get thread history for context
      const messages = await getConversationMessages(input.threadId);
      const items = await getChecklistItems(input.dealId);
      const dealDocuments = await getDocuments(input.dealId);
      const todayMs = Date.now();
      const todayStr = new Date(todayMs).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const closingDateStr = deal.closingDate
        ? new Date(deal.closingDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "not set";
      const daysToClosing = deal.closingDate
        ? Math.ceil((new Date(deal.closingDate).getTime() - todayMs) / 86400000)
        : null;

      const getPartyLabel = (i: typeof items[0]) => {
        if (i.partiesJson) {
          try {
            const arr: string[] = JSON.parse(i.partiesJson);
            if (arr.some((p) => p.toLowerCase() === "all parties")) return "All Parties";
            return arr.join(", ");
          } catch { /* ignore */ }
        }
        return i.partyLabel ?? i.partyCustom ?? i.party ?? "unassigned";
      };

      const checklistSummary = items
        .map((i) => {
          const daysInStatus = i.statusChangedAt
            ? Math.floor((todayMs - i.statusChangedAt) / 86400000)
            : null;
          const parties = getPartyLabel(i);
          const tsNote = daysInStatus !== null ? ` [in this status for ${daysInStatus}d]` : "";
          const partyNote = parties ? ` [responsible: ${parties}]` : "";
          return `[id:${i.id}][${i.section.replace(/_/g, " ")}] ${i.title}: ${i.status}${tsNote}${partyNote}${i.notes ? ` (Note: ${i.notes})` : ""}`;
        })
        .join("\n");

      // Intent detection (same as chat router)
      const intentPrompt = `You are a legal AI assistant. The user sent this message about a deal closing checklist:
"${input.message}"

Here are the current checklist items (each prefixed with its numeric id):
${checklistSummary}

Determine the intent of the message in relation to the deal closing checklist.
Valid statuses: "Executed", "Under Review", "Outstanding", "Waived".

Respond with JSON only, no markdown, matching this exact schema:
{
  "intent": "status_change" | "item_status_query" | "item_duration_query" | "duration_threshold_query" | "status_filter_query" | "clarification_needed" | "not_found" | "party_summary" | "party_comparison" | "email_draft" | "document_summary" | "document_question" | "document_defined_terms" | "document_party_obligations" | "none",
  "matchedItemIds": [<number>],
  "newStatus": "Executed" | "Under Review" | "Outstanding" | "Waived" | null,
  "filterStatus": "Executed" | "Under Review" | "Outstanding" | "Waived" | null,
  "candidateItems": [{"id": <number>, "title": "<string>", "party": "<string>"}],
  "notFoundReference": "<string or null>",
  "partyName": "<string or null>",
  "durationThresholdDays": <number or null>,
  "durationFilterStatus": "Executed" | "Under Review" | "Outstanding" | "Waived" | null,
  "emailPartyName": "<string or null>",
  "emailItemTitles": ["<string>"] or null,
  "documentFilename": "<string or null>",
  "partyNames": ["<string>"] or null
}`;

      const intentResponse = await invokeLLM({
        messages: [{ role: "user" as const, content: intentPrompt }],
        response_format: { type: "json_object" },
      });

      const intentRaw = intentResponse.choices[0]?.message?.content;
      const intentStr = typeof intentRaw === "string" ? intentRaw : Array.isArray(intentRaw) ? (intentRaw as Array<{type:string;text?:string}>).find(c=>c.type==="text")?.text ?? "{}" : "{}";
      let intent: any = {};
      try { intent = JSON.parse(intentStr); } catch { intent = {}; }

      // ── Step 1.5: Detect and block bulk updates ──────────────────────────
      const bulkUpdateKeywords = ["all", "everything", "every", "entire", "whole", "mark all", "move all", "update all", "change all"];
      const hasBulkKeyword = bulkUpdateKeywords.some(kw => input.message.toLowerCase().includes(kw));
      const isBulkStatusChange = intent.intent === "status_change" && (intent.matchedItemIds?.length === 0 || intent.matchedItemIds?.length === items.length) && hasBulkKeyword;

      if (isBulkStatusChange && intent.newStatus) {
        const bulkDeclineReply = `I cannot process bulk status updates for all items simultaneously. Each item must be confirmed individually to maintain accuracy and accountability in the deal closing process.\n\nPlease specify which individual items you would like updated to ${intent.newStatus}. You can reference them by name or describe which specific items need attention.`;
        await saveConversationMessage(input.threadId, "assistant", bulkDeclineReply);
        return { response: bulkDeclineReply };
      }

      // ── Step 2: Execute status change if unambiguous ──────────────────────
      let statusUpdate: { itemId: number; newStatus: string; itemTitle: string; itemParty: string; section: string } | null = null;
      if (intent.intent === "status_change" && intent.matchedItemIds?.length === 1 && intent.newStatus) {
        const targetId = intent.matchedItemIds[0];
        const targetItem = items.find((i) => i.id === targetId);
        if (targetItem) {
          await updateItemStatus(targetId, input.dealId, intent.newStatus as "Executed" | "Under Review" | "Outstanding" | "Waived");
          await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "status_changed", {
            itemId: targetId,
            fromValue: targetItem.status,
            toValue: intent.newStatus,
          });
          statusUpdate = {
            itemId: targetId,
            newStatus: intent.newStatus,
            itemTitle: targetItem.title,
            itemParty: getPartyLabel(targetItem),
            section: targetItem.section,
          };
        }
      }

      // ── Step 3: Compute downstream impact ────────────────────────────────
      const updatedItems = statusUpdate ? await getChecklistItems(input.dealId) : items;
      const cpBlockers = updatedItems.filter((i) => i.section === "conditions_precedent" && (i.status === "Outstanding" || i.status === "Under Review"));
      const cpOutstanding = cpBlockers.length;
      const cpUnderReview = cpBlockers.filter((i) => i.status === "Under Review");
      const cpOutstandingItems = cpBlockers.filter((i) => i.status === "Outstanding");
      const buildStatusGroupedList = (underReview: typeof cpBlockers, outstanding: typeof cpBlockers): string => {
        const fmt = (i: (typeof cpBlockers)[0]) => {
          const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
          const party = getPartyLabel(i);
          return `- ${i.title} [${daysInStatus !== null ? `${daysInStatus}d` : "?"}] — ${party}`;
        };
        const parts: string[] = [];
        if (underReview.length > 0) parts.push(underReview.map(fmt).join("\n"));
        if (outstanding.length > 0) parts.push(outstanding.map(fmt).join("\n"));
        return parts.join("\n");
      };
      const cpBlockerList = buildStatusGroupedList(cpUnderReview, cpOutstandingItems);
      const cpHeadingCounts = cpBlockers.length > 0 ? `${cpUnderReview.length} Under Review, ${cpOutstandingItems.length} Outstanding` : "";
      const tdBlockers = updatedItems.filter((i) => i.section === "transaction_documents" && (i.status === "Outstanding" || i.status === "Under Review"));
      const tdUnderReview = tdBlockers.filter((i) => i.status === "Under Review");
      const tdOutstandingItems = tdBlockers.filter((i) => i.status === "Outstanding");
      const tdBlockerList = buildStatusGroupedList(tdUnderReview, tdOutstandingItems);
      const tdHeadingCounts = tdBlockers.length > 0 ? `${tdUnderReview.length} Under Review, ${tdOutstandingItems.length} Outstanding` : "";
      const tdExecuted = updatedItems.filter((i) => i.section === "transaction_documents").every((i) => i.status === "Executed" || i.status === "Waived");
      const pcBlockers = updatedItems.filter((i) => i.section === "post_closing" && (i.status === "Outstanding" || i.status === "Under Review"));
      const pcUnderReview = pcBlockers.filter((i) => i.status === "Under Review");
      const pcOutstandingItems = pcBlockers.filter((i) => i.status === "Outstanding");
      const pcBlockerList = buildStatusGroupedList(pcUnderReview, pcOutstandingItems);
      const pcHeadingCounts = pcBlockers.length > 0 ? `${pcUnderReview.length} Under Review, ${pcOutstandingItems.length} Outstanding` : "";
      // Executed item lists for each section
      const fmtExecuted = (i: (typeof updatedItems)[0]) => {
        const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
        const party = getPartyLabel(i);
        return `- ${i.title} [${daysInStatus !== null ? `${daysInStatus}d` : "?"}] — ${party}`;
      };
      const cpExecutedItems = updatedItems.filter((i) => i.section === "conditions_precedent" && i.status === "Executed");
      const tdExecutedItems = updatedItems.filter((i) => i.section === "transaction_documents" && i.status === "Executed");
      const pcExecutedItems = updatedItems.filter((i) => i.section === "post_closing" && i.status === "Executed");
      const cpExecutedList = cpExecutedItems.map(fmtExecuted).join("\n");
      const tdExecutedList = tdExecutedItems.map(fmtExecuted).join("\n");
      const pcExecutedList = pcExecutedItems.map(fmtExecuted).join("\n");
      const totalDone = updatedItems.filter((i) => i.status === "Executed" || i.status === "Waived").length;
      const totalItems2 = updatedItems.length;
      const progressPct = totalItems2 > 0 ? Math.round((totalDone / totalItems2) * 100) : 0;

      // ── Step 4: Build context for the main LLM call ───────────────────────
      const buildSectionSummary = (section: string, label: string) => {
        const sectionItems = updatedItems.filter((i) => i.section === section);
        if (sectionItems.length === 0) return `${label}:\n  (no items)`;
        return `${label} (${sectionItems.length} items):\n` + sectionItems
          .map((i) => {
            const daysInStatus = i.statusChangedAt
              ? Math.floor((todayMs - i.statusChangedAt) / 86400000)
              : null;
            const parties = getPartyLabel(i);
            const tsNote = daysInStatus !== null ? `, ${daysInStatus}d in status` : "";
            const partyNote = parties ? `, responsible: ${parties}` : "";
            const notesNote = i.notes ? `, notes: ${i.notes}` : "";
            return `  [id:${i.id}] ${i.title} — ${i.status}${tsNote}${partyNote}${notesNote}`;
          })
          .join("\n");
      };
      const updatedSummary = [
        buildSectionSummary("conditions_precedent", "CONDITIONS PRECEDENT"),
        buildSectionSummary("transaction_documents", "TRANSACTION DOCUMENTS"),
        buildSectionSummary("post_closing", "POST-CLOSING"),
      ].join("\n\n");

      const processedDocs = dealDocuments.filter((d: any) => d.aiProcessed && d.extractedText);
      const uploadedDocsContext = processedDocs.length > 0
        ? `\n\nUPLOADED DOCUMENTS (${processedDocs.length} document${processedDocs.length !== 1 ? "s" : ""} available for reference):\n` +
          processedDocs.map((d: any, idx: number) =>
            `--- DOCUMENT ${idx + 1}: ${d.filename} ---\n${d.extractedText}\n--- END DOCUMENT ${idx + 1} ---`
          ).join("\n\n")
        : "";

      const actionContext = statusUpdate
        ? `\n\nACTION ALREADY TAKEN: You have already updated "${statusUpdate.itemTitle}" to ${statusUpdate.newStatus}. Confirm this to the user in plain English, then provide the downstream impact using the structure below.\n\nDOWNSTREAM IMPACT — YOU MUST FOLLOW THIS STRUCTURE EXACTLY AND INCLUDE ALL THREE SECTIONS. IMPORTANT: The counts below are authoritative — they were computed by the system and are guaranteed to match the number of items listed. You MUST reproduce these counts verbatim. Do NOT recount, do NOT recalculate, do NOT paraphrase the numbers. Do NOT use advisory or urgency labels such as "critical blockers" or "required at closing" in any section heading.\n1. CONDITIONS PRECEDENT — ${cpBlockers.length > 0 ? cpHeadingCounts : "all clear"} (SYSTEM COUNT: ${cpBlockers.length}): ${cpBlockers.length > 0 ? `List all ${cpBlockers.length} items below, grouped by status exactly as provided. Under Review items first, then Outstanding items. Do not merge the two groups.\n${cpBlockerList}\nYOU MUST LIST EVERY SINGLE ONE OF THE ABOVE ${cpBlockers.length} CPs BY NAME AND RESPONSIBLE PARTY. Do not summarise, do not stop after the first item.` : "All conditions precedent have been satisfied or waived — there are no outstanding or under review items in this section."}\n2. TRANSACTION DOCUMENTS — ${tdBlockers.length > 0 ? tdHeadingCounts : "all clear"} (SYSTEM COUNT: ${tdBlockers.length}): ${tdBlockers.length === 0 ? "All transaction documents are executed or waived — there are no outstanding or under review items in this section." : `List all ${tdBlockers.length} items below, grouped by status exactly as provided. Under Review items first, then Outstanding items. Do not merge the two groups.\n${tdBlockerList}`}\n3. POST-CLOSING — ${pcBlockers.length > 0 ? pcHeadingCounts : "all clear"} (SYSTEM COUNT: ${pcBlockers.length}): ${pcBlockers.length > 0 ? `List all ${pcBlockers.length} items below, grouped by status exactly as provided. Under Review items first, then Outstanding items. Do not merge the two groups.\n${pcBlockerList}` : "All post-closing items are complete or waived — there are no outstanding or under review items in this section."}\n4. OVERALL PROGRESS: ${progressPct}% complete (${totalDone} of ${totalItems2} items executed or waived).`
        : intent.intent === "clarification_needed"
        ? `\n\nAMBIGUITY DETECTED: The user's message could refer to multiple items. Ask for clarification without making any changes. The candidates are: ${(intent.candidateItems ?? []).map((c: any) => `"${c.title}" (assigned to ${c.party})`).join("; ")}.`
        : intent.intent === "not_found"
        ? `\n\nITEM NOT FOUND: The user referenced "${intent.notFoundReference}" but no matching item exists on the checklist. Tell the user clearly and offer to add it as a new item.`
        : intent.intent === "party_summary" && intent.partyName
        ? (() => {
            const pName = intent.partyName as string;
            const partyItems = updatedItems.filter((i) => {
              const label = getPartyLabel(i).toLowerCase();
              const query = pName.toLowerCase();
              return label.includes(query) || query.includes(label);
            });
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "CONDITIONS PRECEDENT" },
              { key: "transaction_documents", label: "TRANSACTION DOCUMENTS" },
              { key: "post_closing", label: "POST-CLOSING" },
            ];
            const fmtItem = (i: typeof updatedItems[0]) => {
              const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
              return `  - "${i.title}" [${i.status}${daysInStatus !== null ? `, ${daysInStatus}d in status` : ""}]`;
            };
            const sectionBlocks = sections.map(({ key, label }) => {
              const sItems = partyItems.filter((i) => i.section === key);
              if (sItems.length === 0) return `${label}: No outstanding or under review items.`;
              const underReview = sItems.filter((i) => i.status === "Under Review");
              const outstanding = sItems.filter((i) => i.status === "Outstanding");
              const parts: string[] = [`${label} (${sItems.length} items):`];
              if (underReview.length > 0) parts.push(`  Under Review (${underReview.length}):\n${underReview.map(fmtItem).join("\n")}`);
              if (outstanding.length > 0) parts.push(`  Outstanding (${outstanding.length}):\n${outstanding.map(fmtItem).join("\n")}`);
              return parts.join("\n");
            }).join("\n\n");
            const totalPartyItems = partyItems.filter((i) => i.status === "Outstanding" || i.status === "Under Review").length;
            return `\n\nPARTY SUMMARY REQUEST: The lawyer asked about outstanding items for "${pName}". There are ${totalPartyItems} outstanding or under review item(s) assigned to this party. Provide a clear, structured breakdown by section using the data below. If no items are found for this party, say so clearly and suggest checking the party name spelling.\n\nItems assigned to "${pName}" (${totalPartyItems} outstanding/under review):\n${sectionBlocks}`;
          })()
        : intent.intent === "party_comparison" && intent.partyNames && intent.partyNames.length >= 2
        ? (() => {
            const pNames = intent.partyNames as string[];
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "CONDITIONS PRECEDENT" },
              { key: "transaction_documents", label: "TRANSACTION DOCUMENTS" },
              { key: "post_closing", label: "POST-CLOSING" },
            ];
            const fmtItem = (i: typeof updatedItems[0]) => {
              const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
              return `  - "${i.title}" [${i.status}${daysInStatus !== null ? `, ${daysInStatus}d in status` : ""}]`;
            };
            const partyData = pNames.map((pName) => {
              const partyItems = updatedItems.filter((i) => {
                const label = getPartyLabel(i).toLowerCase();
                const query = pName.toLowerCase();
                return (i.status === "Outstanding" || i.status === "Under Review") && (label.includes(query) || query.includes(label));
              });
              const sectionBlocks = sections.map(({ key, label }) => {
                const sItems = partyItems.filter((i) => i.section === key);
                if (sItems.length === 0) return `  ${label}: No outstanding or under review items.`;
                const underReview = sItems.filter((i) => i.status === "Under Review");
                const outstanding = sItems.filter((i) => i.status === "Outstanding");
                const parts: string[] = [`  ${label} (${sItems.length} items):`];
                if (underReview.length > 0) parts.push(`    Under Review (${underReview.length}):\n${underReview.map(fmtItem).join("\n")}`);
                if (outstanding.length > 0) parts.push(`    Outstanding (${outstanding.length}):\n${outstanding.map(fmtItem).join("\n")}`);
                return parts.join("\n");
              }).join("\n");
              return { name: pName, total: partyItems.length, outstanding: partyItems.filter((i) => i.status === "Outstanding").length, underReview: partyItems.filter((i) => i.status === "Under Review").length, sectionBlocks };
            });
            const tableRows = partyData.map((p) => `| ${p.name} | ${p.outstanding} | ${p.underReview} | ${p.total} |`).join("\n");
            const detailBlocks = partyData.map((p) => `PARTY: ${p.name} (${p.total} remaining)\n${p.sectionBlocks}`).join("\n\n---\n\n");
            return `\n\nPARTY COMPARISON REQUEST: The lawyer asked to compare outstanding obligations for: ${pNames.join(", ")}. Provide a summary table and section-by-section breakdown using the data below. Follow the PARTY COMPARISON RULE in the system prompt.\n\nSUMMARY TABLE:\n| Party | Outstanding | Under Review | Total Remaining |\n|---|---|---|---|\n${tableRows}\n\nDETAILED BREAKDOWN:\n${detailBlocks}`;
          })()
        : intent.intent === "item_status_query" && intent.matchedItemIds?.length === 1
        ? (() => {
            const item = items.find((i) => i.id === intent.matchedItemIds[0]);
            if (!item) return `\n\nITEM STATUS QUERY: The referenced item (id: ${intent.matchedItemIds[0]}) was not found. Tell the user clearly.`;
            const daysInStatus = item.statusChangedAt ? Math.floor((todayMs - item.statusChangedAt) / 86400000) : null;
            const party = getPartyLabel(item);
            return `\n\nITEM STATUS QUERY: The lawyer asked about the status of "${item.title}". Current status: ${item.status}${daysInStatus !== null ? ` (${daysInStatus} day${daysInStatus !== 1 ? "s" : ""} in this status)` : ""}. Responsible party: ${party}. Section: ${item.section.replace(/_/g, " ")}. Provide this information clearly and concisely.`;
          })()
        : intent.intent === "item_duration_query" && intent.matchedItemIds?.length === 1
        ? (() => {
            const item = items.find((i) => i.id === intent.matchedItemIds[0]);
            if (!item) return `\n\nITEM DURATION QUERY: The referenced item was not found. Tell the user clearly.`;
            const daysInStatus = item.statusChangedAt ? Math.floor((todayMs - item.statusChangedAt) / 86400000) : null;
            return `\n\nITEM DURATION QUERY: The lawyer asked how long "${item.title}" has been in its current status. Current status: ${item.status}. Days in status: ${daysInStatus !== null ? daysInStatus : "unknown (no status change timestamp recorded)"}. Provide this information clearly.`;
          })()
        : intent.intent === "duration_threshold_query" && intent.durationThresholdDays !== null
        ? (() => {
            const threshold = intent.durationThresholdDays as number;
            const filterStatus = intent.durationFilterStatus as string | null;
            const matchingItems = updatedItems.filter((i) => {
              if (!i.statusChangedAt) return false;
              const days = Math.floor((todayMs - i.statusChangedAt) / 86400000);
              const statusMatch = filterStatus ? i.status === filterStatus : true;
              return days >= threshold && statusMatch;
            });
            const fmt = (i: typeof updatedItems[0]) => {
              const days = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : 0;
              const party = getPartyLabel(i);
              return `- "${i.title}" [${i.status}, ${days}d in status] — responsible: ${party}`;
            };
            return `\n\nDURATION THRESHOLD QUERY: The lawyer asked for items that have been ${filterStatus ? `"${filterStatus}"` : "in any status"} for more than ${threshold} day${threshold !== 1 ? "s" : ""}. Found ${matchingItems.length} matching item(s):\n${matchingItems.length > 0 ? matchingItems.map(fmt).join("\n") : "(none)"}`;
          })()
        : intent.intent === "status_filter_query" && intent.filterStatus
        ? (() => {
            const fs = intent.filterStatus as string;
            const validStatuses = ["Executed", "Under Review", "Outstanding", "Waived"];
            const normalisedStatus = validStatuses.find((s) => s.toLowerCase() === fs.toLowerCase()) ?? fs;
            const matchingItems = updatedItems.filter((i) => i.status === normalisedStatus);
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "CONDITIONS PRECEDENT" },
              { key: "transaction_documents", label: "TRANSACTION DOCUMENTS" },
              { key: "post_closing", label: "POST-CLOSING" },
            ];
            const fmt = (i: typeof updatedItems[0]) => {
              const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
              const party = getPartyLabel(i);
              return `  - "${i.title}"${daysInStatus !== null ? ` [${daysInStatus}d in status]` : ""} — responsible: ${party}`;
            };
            const sectionBlocks = sections.map(({ key, label }) => {
              const sItems = matchingItems.filter((i) => i.section === key);
              if (sItems.length === 0) return null;
              return `${label} (${sItems.length}):\n${sItems.map(fmt).join("\n")}`;
            }).filter(Boolean).join("\n\n");
            return `\n\nSTATUS FILTER QUERY: The lawyer asked for all items with status "${normalisedStatus}". Found ${matchingItems.length} item(s):\n${matchingItems.length > 0 ? sectionBlocks : "(none)"}`;
          })()
        : intent.intent === "email_draft" && intent.emailPartyName
        ? (() => {
            const eName = intent.emailPartyName as string;
            const requestedTitles: string[] | null = intent.emailItemTitles && intent.emailItemTitles.length > 0 ? intent.emailItemTitles : null;
            const partyItems = updatedItems.filter((i) => {
              const label = getPartyLabel(i).toLowerCase();
              const query = eName.toLowerCase();
              return (i.status === "Outstanding" || i.status === "Under Review") && (label.includes(query) || query.includes(label));
            });
            let eItems = partyItems;
            const unmatchedTitles: string[] = [];
            if (requestedTitles) {
              eItems = [];
              for (const reqTitle of requestedTitles) {
                const reqLower = reqTitle.toLowerCase();
                const matched = updatedItems.find((i) =>
                  i.title.toLowerCase().includes(reqLower) || reqLower.includes(i.title.toLowerCase())
                );
                if (matched) {
                  if (!eItems.find((x) => x.id === matched.id)) eItems.push(matched);
                } else {
                  unmatchedTitles.push(reqTitle);
                }
              }
            }
            const sections: Array<{ key: string; label: string }> = [
              { key: "conditions_precedent", label: "Conditions Precedent" },
              { key: "transaction_documents", label: "Transaction Documents" },
              { key: "post_closing", label: "Post-Closing" },
            ];
            const fmtEmail = (i: typeof updatedItems[0]) => {
              const daysInStatus = i.statusChangedAt ? Math.floor((todayMs - i.statusChangedAt) / 86400000) : null;
              return `  - ${i.title} [${i.status}${daysInStatus !== null ? `, ${daysInStatus} day${daysInStatus !== 1 ? "s" : ""} in status` : ""}]`;
            };
            const sectionBlocks = sections.map(({ key, label }) => {
              const sItems = eItems.filter((i) => i.section === key);
              if (sItems.length === 0) return null;
              return `${label}:\n${sItems.map(fmtEmail).join("\n")}`;
            }).filter(Boolean).join("\n\n");
            const closingDateForEmail = deal.closingDate
              ? new Date(deal.closingDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "[closing date TBC]";
            const scopeNote = requestedTitles
              ? `The lawyer has requested that only the following specific items be included: ${requestedTitles.join(", ")}. ${unmatchedTitles.length > 0 ? `NOTE: The following requested items could not be matched on the checklist and must be flagged in the email: ${unmatchedTitles.join(", ")}.` : "All requested items have been matched."}`
              : `Include all outstanding and under review items assigned to ${eName}.`;
            return `\n\nEMAIL DRAFT REQUEST: The lawyer has asked you to draft a professional chaser email to "${eName}" about items on this deal. ${scopeNote} Draft the email below. IMPORTANT RULES FOR THE EMAIL DRAFT:\n1. Begin with a clear subject line in the format: Subject: [Deal name] — Outstanding Items for Attention\n2. Address the email to ${eName}\n3. Opening paragraph: reference the deal name, the target closing date (${closingDateForEmail}), and the number of days remaining (${daysToClosing !== null ? daysToClosing + " days" : "TBC"})\n4. List the items grouped by section exactly as provided below\n5. If any requested items could not be matched on the checklist, note this clearly in the email body\n6. Closing paragraph: request an update by return and state that timely resolution is required to keep the transaction on track for closing\n7. Sign off professionally (e.g. "Yours sincerely," followed by a placeholder for the lawyer's name and firm)\n8. Write in the professional legal tone of a senior associate at a Magic Circle law firm — precise, direct, and formal\n9. Do NOT send the email — this is a draft for the lawyer to review\n10. Label the output clearly as DRAFT EMAIL\n\nItems to include (${eItems.length} item${eItems.length !== 1 ? "s" : ""}):\n${eItems.length > 0 ? sectionBlocks : "No matching items found for the specified criteria."}\n\nDeal: ${deal.name} | Closing: ${closingDateForEmail} | ${daysToClosing !== null ? daysToClosing + " days remaining" : "closing date TBC"}`;
          })()
        : intent.intent === "document_summary" || intent.intent === "document_question" || intent.intent === "document_defined_terms" || intent.intent === "document_party_obligations"
        ? (() => {
            const reqFilename = intent.documentFilename as string | null;
            const matchedDoc = reqFilename
              ? processedDocs.find((d: any) => d.filename.toLowerCase().includes(reqFilename.toLowerCase()) || reqFilename.toLowerCase().includes(d.filename.toLowerCase()))
              : null;
            if (processedDocs.length === 0) {
              return `\n\nDOCUMENT REQUEST: No documents have been uploaded and processed for this deal yet. Tell the lawyer that no documents are currently available for analysis.`;
            }
            if (reqFilename && !matchedDoc) {
              const docList = processedDocs.map((d: any, idx: number) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT REQUEST: The lawyer referenced "${reqFilename}" but no document with that name has been uploaded. The following documents are currently available:\n${docList}\n\nAsk the lawyer to clarify which document they would like analysed.`;
            }
            if (!reqFilename && processedDocs.length > 1) {
              const docList = processedDocs.map((d: any, idx: number) => `${idx + 1}. ${d.filename}`).join("\n");
              return `\n\nDOCUMENT REQUEST: The lawyer asked about a document but did not specify which one. The following documents are currently uploaded:\n${docList}\n\nAsk the lawyer to specify which document they would like analysed.`;
            }
            const doc = matchedDoc ?? processedDocs[0];
            if (intent.intent === "document_summary") {
              return `\n\nDOCUMENT SUMMARY REQUEST: The lawyer has asked for a summary of "${doc.filename}". Provide a structured factual overview following the DOCUMENT SUMMARY RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
            } else if (intent.intent === "document_question") {
              return `\n\nDOCUMENT QUESTION: The lawyer asked: "${input.message}" about "${doc.filename}". Answer only the specific question asked, using only the content of the document below. Follow the DOCUMENT QUESTION RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
            } else if (intent.intent === "document_defined_terms") {
              return `\n\nDOCUMENT DEFINED TERMS REQUEST: The lawyer has asked to extract all defined terms from "${doc.filename}". Follow the DOCUMENT DEFINED TERMS RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
            } else {
              const focusParty = intent.partyName as string | null;
              const partyFocusNote = focusParty
                ? `The lawyer is specifically asking about the party: "${focusParty}". Focus your analysis on that party, but mention other parties briefly if relevant.`
                : `The lawyer is asking about all parties. Identify every named party and provide a breakdown for each.`;
              return `\n\nDOCUMENT PARTY OBLIGATIONS REQUEST: The lawyer has asked to identify the obligations, rights, and responsibilities of parties in "${doc.filename}". ${partyFocusNote} Using the extracted text below, provide a structured breakdown. Your response MUST follow the DOCUMENT PARTY OBLIGATIONS RULE in the system prompt.\n\nDocument: ${doc.filename}\n--- EXTRACTED TEXT START ---\n${doc.extractedText}\n--- EXTRACTED TEXT END ---`;
            }
          })()
        : "";

      // ── Deal metadata for narrative intro ────────────────────────────────
      const dealNarrative = (() => {
        const parts: string[] = [];
        if (deal.targetCompany) parts.push(`Target company: ${deal.targetCompany}`);
        if (deal.dealStructure) parts.push(`Deal structure: ${deal.dealStructure}${(deal as any).dealStructureOther ? ` (${(deal as any).dealStructureOther})` : ""}`);
        if (deal.buyerName) parts.push(`Buyer: ${deal.buyerName}`);
        if (deal.sellerName) parts.push(`Seller: ${deal.sellerName}`);
        if (deal.dealValue) parts.push(`Deal value: ${deal.dealValue}`);
        if (deal.governingLaw) parts.push(`Governing law: ${deal.governingLaw}`);
        if ((deal as any).buyerCounsel) parts.push(`Buyer's counsel: ${(deal as any).buyerCounsel}`);
        if ((deal as any).sellerCounsel) parts.push(`Seller's counsel: ${(deal as any).sellerCounsel}`);
        return parts.join(" | ");
      })();

      const systemPrompt = `You are Clark, an AI legal assistant for the deal closing platform ClosingRoom. Your name is Clark. You are helping with the deal: "${deal.name}".
Today's date: ${todayStr}
Target closing date: ${closingDateStr}${daysToClosing !== null ? ` (${daysToClosing >= 0 ? daysToClosing + " days remaining" : Math.abs(daysToClosing) + " days overdue"})` : ""}
Deal metadata: ${dealNarrative || "(no additional deal metadata recorded)"}
Current closing checklist status (each item shows how long it has been in its current status and who is responsible):
${updatedSummary}
OVERALL PROGRESS: ${progressPct}% complete (${totalDone} of ${totalItems2} items executed or waived).
CHECKLIST ITEMS REFERENCE (authoritative — computed directly from the database, reproduce these verbatim when reporting on checklist items):
1. CONDITIONS PRECEDENT (outstanding/under-review: ${cpBlockers.length}, executed: ${cpExecutedItems.length})${cpBlockers.length > 0 ? `:\nItems:\n${cpBlockerList}` : ""}${cpExecutedItems.length > 0 ? `\n\nExecuted:\n${cpExecutedList}` : cpBlockers.length === 0 ? ": All conditions precedent have been satisfied or waived." : ""}
2. TRANSACTION DOCUMENTS (outstanding/under-review: ${tdBlockers.length}, executed: ${tdExecutedItems.length})${tdBlockers.length > 0 ? `:\nItems:\n${tdBlockerList}` : ""}${tdExecutedItems.length > 0 ? `\n\nExecuted:\n${tdExecutedList}` : tdBlockers.length === 0 ? ": All transaction documents are executed or waived." : ""}
3. POST-CLOSING (outstanding/under-review: ${pcBlockers.length}, executed: ${pcExecutedItems.length})${pcBlockers.length > 0 ? `:\nItems:\n${pcBlockerList}` : ""}${pcExecutedItems.length > 0 ? `\n\nExecuted:\n${pcExecutedList}` : pcBlockers.length === 0 ? ": All post-closing items are complete or waived." : ""}
Status values: Executed, Under Review, Outstanding, Waived. "Under Review" means in progress or awaiting review.
When asked about prioritisation or what to focus on, rank Outstanding and Under Review items by section and days in status:
1. Section order: Conditions Precedent first, then Transaction Documents, then Post-Closing.
2. Within each section, list Under Review items first (grouped under a subheading "Under Review"), then Outstanding items (grouped under a subheading "Outstanding"). Never merge the two statuses into a single list.
3. Days in current status: within each status group, items that have been in that status longer appear first.
4. Days to closing: note the number of days remaining as context.
For each item you present, clearly state: the item name, its current status, how long it has been in that status, and who is responsible.
CRITICAL RULE — PROGRESS PERCENTAGE: The OVERALL PROGRESS figure above is authoritative and was computed by the system as (Executed + Waived items) / total items. You MUST use this exact figure when stating the deal's completion percentage. Never calculate it yourself.
CRITICAL RULE — CHECKLIST ITEMS EXHAUSTIVE LIST: The CHECKLIST ITEMS REFERENCE above lists every item grouped by section and status. When reporting on any section, you MUST reproduce every item from this reference without omission — both outstanding/under-review items AND executed items. When asked for a full deal summary, list all three sections with both their outstanding/under-review items AND their executed items. Never add items not in this reference.

SECTION HEADING FORMAT — MANDATORY: When reporting on any section, the heading MUST show the split count of Under Review and Outstanding items separately. Use this exact format:
- "CONDITIONS PRECEDENT — N Under Review, N Outstanding" (e.g. "CONDITIONS PRECEDENT — 2 Under Review, 3 Outstanding")
- "TRANSACTION DOCUMENTS — N Under Review, N Outstanding" (e.g. "TRANSACTION DOCUMENTS — 5 Under Review, 2 Outstanding")
- "POST-CLOSING — N Under Review, N Outstanding" (e.g. "POST-CLOSING — 0 Under Review, 7 Outstanding")
If a count is zero, include it as 0 (e.g. "0 Under Review, 7 Outstanding"). Never use a combined total such as "(7 items remaining)" or "(2 items remaining)".

PHRASES THAT ARE FORBIDDEN in all responses: "must be satisfied before closing", "are required at closing", "are still outstanding or under review and must be satisfied before closing", "critical blocker", "required at closing", "urgent", "can wait", "must complete before closing", "needed at closing". Replace all such phrases with neutral factual language, for example: "The following Conditions Precedent remain" or "The following Transaction Documents remain".

Do NOT reference statutory deadlines, legislation, consequences of non-compliance, or any legal obligations in any response under any circumstances.

CRITICAL RULE — EXHAUSTIVE SECTION REPORTING: Whenever you report on deal status, outstanding items, or the result of a status update, you MUST address all three sections — Conditions Precedent, Transaction Documents, and Post-Closing — and for each section you MUST do one of the following: (a) list every outstanding or under-review item by name and responsible party, OR (b) explicitly state that the section is fully clear with a sentence such as "All conditions precedent have been satisfied or waived — there are no outstanding or under review items in this section." Silence is never acceptable as confirmation in a legal closing context. Never omit a section. Never stop after the first outstanding CP — list every single one. Never summarise with phrases like "including", "such as", or "among others". Omitting any outstanding item or silently skipping a section is a critical error in a legal closing tool.
CRITICAL RULE — COUNT ACCURACY: When the system provides a SYSTEM COUNT for a section, that count is authoritative and was computed directly from the database. You MUST use that exact number in your response heading for that section. Never recount the items yourself. Never state a number that differs from the SYSTEM COUNT. A mismatch between the count in your heading and the number of items you list is a critical error.
Answer questions about this deal concisely and professionally. Focus on deal status, outstanding items, risks, and next steps. Do not give general legal advice unrelated to this specific deal.
DEAL NARRATIVE INTRODUCTION RULE: When the lawyer asks for a full status update, a deal summary, or a general overview of the deal, you MUST begin your response with a brief factual introductory paragraph before the checklist breakdown. This paragraph must state: the deal name, deal structure, target company name (if recorded), buyer name, seller name, deal value, governing law, and target closing date. Then state the current overall progress percentage and days remaining. Example format: "[Deal name] is a [deal value] [deal structure] of [target company] by [buyer] from [seller], governed by [governing law], with a target closing date of [date]. The deal is currently [N]% complete with [N] days remaining until closing." Use only the deal metadata provided above — do not invent or assume any values. If a field is not recorded, omit it from the sentence rather than stating "unknown" or "not provided".

TONE AND CONDUCT: Communicate like a senior associate at a Magic Circle law firm — precise, confident, and direct. Never apologise unless you have genuinely made an error in a previous response in this conversation. Do not say "sorry", do not say "my apologies", do not acknowledge any oversight. When a lawyer provides new information and asks you to update the checklist, act on it immediately and confirm what you did in a confident, professional tone. Simply confirm the update and provide the downstream impact. Never hedge unnecessarily or use filler phrases.${uploadedDocsContext}

PARTY COMPARISON RULE (apply when a PARTY COMPARISON REQUEST block is present in the context):
When the lawyer asks to compare the outstanding obligations of two or more parties:
1. Begin with a SUMMARY TABLE showing each party's name, Outstanding count, Under Review count, and Total remaining items. Present this as a formatted table with clear column headers.
2. Then provide a SECTION-BY-SECTION BREAKDOWN for each party, using the data provided in the PARTY COMPARISON REQUEST block. For each party, show three sub-sections: CONDITIONS PRECEDENT, TRANSACTION DOCUMENTS, and POST-CLOSING. Under each sub-section, list the items grouped by status (Under Review first, then Outstanding). If a party has no items in a section, explicitly state: "No outstanding or under review items in this section."
3. Use the exact counts provided in the PARTY COMPARISON REQUEST block — do NOT recount.
4. If a party name was not found in the checklist, state this clearly and suggest the lawyer check the party name spelling.
5. Present the comparison in a clear, readable format with each party as a distinct block separated by a horizontal rule or clear heading.
6. Do not make legal judgments about which party's position is more or less favourable.
7. Do not omit any party named in the request, and do not omit any section for any party.

DOCUMENT READING RULES (apply whenever answering questions about uploaded documents):
1. FACTUAL OBSERVATIONS ONLY: When answering questions about an uploaded document, make only factual observations about what is present in the document — party names, dates, defined terms, conditions, whether clearance or consent appears to have been granted, and similar factual content. Never make legal judgments about whether a document is legally valid, properly executed, or sufficient to satisfy a condition precedent.
2. ALWAYS REMIND TO REVIEW: After answering any question about a document, always include this reminder: "Please review the document yourself before updating any checklist item status."
3. PROPOSE BEFORE ACTING: If the content of an uploaded document appears to evidence completion of a checklist item, do NOT automatically mark the item as Executed. Instead, ask the lawyer whether they would like you to mark it. Example: "This document appears to confirm CMA merger clearance has been granted. Would you like me to mark CMA merger clearance as Executed?" Wait for the lawyer's confirmation before taking any action.
4. SCOPE: These rules apply to all documents uploaded to any checklist item across all three sections — Conditions Precedent, Transaction Documents, and Post-Closing.

DOCUMENT SUMMARY RULE (apply when a DOCUMENT SUMMARY REQUEST is present in the context):
When asked to summarise an uploaded document, provide a concise factual overview structured as follows:
1. Document name and type (e.g. letter, agreement, consent, clearance notice)
2. Parties named in the document (list all parties identified)
3. Key dates (execution date, effective date, expiry date, or any other material dates present)
4. Subject matter and purpose (one or two sentences describing what the document is about)
5. Key terms, conditions, or obligations present (factual only — do not assess whether they are satisfied)
6. Any clearances, consents, or approvals that appear to have been granted
Do NOT assess whether the document is legally valid, properly executed, or sufficient to satisfy any condition precedent. End every document summary with: "Please review the document yourself before updating any checklist item status."

DOCUMENT QUESTION RULE (apply when a DOCUMENT QUESTION block is present in the context):
When answering a specific follow-up question about an uploaded document:
1. Answer only the specific question asked, using only the content of the document provided in the DOCUMENT QUESTION block.
2. Be precise and direct — quote or closely paraphrase the relevant part of the document where possible.
3. If the answer cannot be determined from the document text, say so clearly: "The document does not appear to contain this information."
4. Never speculate or infer information that is not explicitly present in the document.
5. Never make legal judgments about whether a document is legally valid, properly executed, or sufficient to satisfy any condition precedent.
6. End every answer with: "Please review the document yourself before updating any checklist item status."

DOCUMENT DEFINED TERMS RULE (apply when a DOCUMENT DEFINED TERMS REQUEST block is present in the context):
When extracting defined terms from an uploaded document:
1. Identify every term that is explicitly defined in the document.
2. Present the results as a structured list in alphabetical order. For each entry, show the defined term in bold followed by its definition exactly as it appears in the document.
3. If a term is defined in multiple places, include the primary definition and note that it appears elsewhere.
4. If no defined terms can be identified in the document, say so clearly: "No explicitly defined terms were found in this document."
5. Never infer or fabricate definitions that are not present in the document text.
6. Never make legal judgments about whether the definitions are adequate, enforceable, or consistent with market practice.
7. End the response with: "Please review the document yourself before updating any checklist item status."

DOCUMENT PARTY OBLIGATIONS RULE (apply when a DOCUMENT PARTY OBLIGATIONS REQUEST block is present in the context):
When identifying obligations, rights, and responsibilities of parties in an uploaded document:
1. Identify every named party in the document.
2. For each party, list their obligations, rights, and responsibilities as explicitly stated in the document.
3. Present the results in a structured format with each party as a distinct section.
4. Be precise and direct — quote or closely paraphrase the relevant parts of the document.
5. If a party has no explicit obligations, rights, or responsibilities stated, say so clearly.
6. Never speculate or infer obligations that are not explicitly present in the document.
7. Never make legal judgments about whether obligations are enforceable, onerous, or consistent with market practice.
8. End the response with: "Please review the document yourself before updating any checklist item status."

BULK STATUS UPDATE PREVENTION RULE:
You MUST NEVER process bulk status updates that attempt to change the status of all items (or all items in a section) to a single status in one command. This includes requests phrased as:
- "Mark all items as Executed"
- "Move everything to Executed"
- "Set all outstanding items to Waived"
- "Change all items in Post-Closing to Executed"
- "Execute all items" or similar variations

When you receive any such bulk update request, you MUST:
1. Decline the request clearly and explain why
2. State that each item must be updated individually to maintain accuracy and accountability on the closing checklist
3. Ask the lawyer to specify which individual items they would like you to update
4. Wait for the lawyer to provide specific item names or a more granular request

Example response: "I cannot mark all items as Executed in a single command. Each item must be updated individually to maintain accuracy and accountability on the closing checklist. Please tell me which specific item you would like me to update and I will action it immediately."

This rule applies regardless of how the bulk update request is phrased or what status is requested.${actionContext}`;

      const threadHistory = messages.slice(-40).map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));
      // Remove the last message (the user message we just saved) to avoid duplication
      const historyWithoutLastUser = threadHistory.slice(0, -1);
      const llmMessages = [
        { role: "system" as const, content: systemPrompt },
        ...historyWithoutLastUser,
        { role: "user" as const, content: input.message },
      ];
      const response = await invokeLLM({ messages: llmMessages });
      const rawContent = response.choices[0]?.message?.content;
      const reply = typeof rawContent === "string" ? rawContent : Array.isArray(rawContent) ? (rawContent as Array<{type:string;text?:string}>).find(c=>c.type==="text")?.text ?? "I could not generate a response." : "I could not generate a response.";

      // Save assistant response
      await saveConversationMessage(input.threadId, "assistant", reply);

      return {
        response: reply,
        statusUpdate: statusUpdate ? { itemId: statusUpdate.itemId, newStatus: statusUpdate.newStatus } : null,
      };
    }),
});

// ─── Documents ────────────────────────────────────────────────────────────────

const documentsRouter = router({
  list: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .query(({ input }) => getDocuments(input.dealId)),

  getUploadUrl: protectedProcedure
    .input(z.object({ dealId: z.number(), filename: z.string(), mimeType: z.string(), sizeBytes: z.number(), checklistItemId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "Viewers cannot upload documents" });
      const key = `deals/${input.dealId}/docs/${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const docId = await createDocument(input.dealId, ctx.user.id, input.filename, key, input.mimeType, input.sizeBytes, input.checklistItemId);
      return { docId, key };
    }),

  confirmUpload: protectedProcedure
    .input(z.object({ docId: z.number(), dealId: z.number(), storageKey: z.string(), fileContent: z.string(), filename: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });

      // Store the file content to S3
      // storagePut appends a hash suffix to the key, so we must capture and persist the actual stored key
      const buffer = Buffer.from(input.fileContent, "base64");
      const { key: actualStorageKey } = await storagePut(input.storageKey, buffer, "application/pdf");
      // Update the DB record with the actual key (which includes the hash suffix)
      await updateDocumentStorageKey(input.docId, actualStorageKey);

      // Extract full document text using AI (file_url with base64 data URI for PDF)
      const dataUri = `data:application/pdf;base64,${input.fileContent}`;
      const extractResponse = await invokeLLM({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file_url",
                file_url: { url: dataUri, mime_type: "application/pdf" },
              },
              {
                type: "text",
                text: `Extract the complete text content of this document verbatim. Include all party names, dates, defined terms, conditions, obligations, and any other substantive text. Do not summarise — reproduce the full text as accurately as possible. This text will be used by an AI assistant to answer questions about the document.`,
              },
            ],
          },
        ],
      });
      const rawExtract = extractResponse.choices[0]?.message?.content;
      const extractedText = typeof rawExtract === "string" ? rawExtract : Array.isArray(rawExtract) ? (rawExtract as Array<{type:string;text?:string}>).find(c=>c.type==="text")?.text ?? "" : "";

      await updateDocumentExtraction(input.docId, extractedText);
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "document_uploaded", { metadata: input.storageKey });

      // Save a neutral acknowledgement as an assistant chat message
      const ackMessage = `Document received: **${input.filename ?? "document"}**. Ask me anything about it.`;
      await saveChatMessage(input.dealId, "assistant", ackMessage);

      return { extractedText };
    }),

  delete: protectedProcedure
    .input(z.object({ docId: z.number(), dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole === "viewer" || accessRole === "editor") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to delete documents" });
      await deleteDocument(input.docId, input.dealId);
      return { success: true };
    }),

  getUrl: protectedProcedure
    .input(z.object({ storageKey: z.string() }))
    .query(async ({ input }) => {
      // Return the raw presigned CloudFront URL so the browser can fetch it directly.
      // The proxy path (/manus-storage/) redirects to a URL signed for the server's IP,
      // which CloudFront rejects when the browser follows the redirect.
      // Using storageGetSignedUrl here means the presigned URL is generated server-side
      // but the browser fetches it directly — CloudFront signed URLs are not IP-restricted.
      const url = await storageGetSignedUrl(input.storageKey);
      return { url };
    }),
  getByItem: protectedProcedure
    .input(z.object({ dealId: z.number(), checklistItemId: z.number() }))
    .query(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const docs = await getDocumentsByItem(input.dealId, input.checklistItemId);
      return docs.map((d) => ({
        id: d.id,
        filename: d.filename,
        storageKey: d.storageKey,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        aiProcessed: d.aiProcessed,
        createdAt: d.createdAt,
        previewUrl: `/manus-storage/${d.storageKey}`,
      }));
    }),

  linkToItem: protectedProcedure
    .input(z.object({ docId: z.number(), dealId: z.number(), checklistItemId: z.number().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      await linkDocumentToItem(input.docId, input.dealId, input.checklistItemId);
      return { success: true };
    }),
});

// ─── Audit Log ────────────────────────────────────────────────────────────────

const auditRouter = router({
  list: protectedProcedure
    .input(z.object({ dealId: z.number(), limit: z.number().optional() }))
    .query(({ input }) => getAuditLog(input.dealId, input.limit ?? 100)),
});
// ─── Signature Pages ──────────────────────────────────────────────────────────

const signaturesRouter = router({
  list: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .query(({ input }) => getSignaturePages(input.dealId)),

  create: protectedProcedure
    .input(z.object({
      dealId: z.number(),
      signatoryName: z.string().min(1),
      signatoryParty: z.string().min(1),
      method: z.enum(["wet_ink", "electronic", "counterpart"]),
      itemId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sigId = await createSignaturePage(input.dealId, input.signatoryName, input.signatoryParty, input.method, input.itemId, input.notes);
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "signature_added", { metadata: input.signatoryName });
      return { sigId };
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      sigId: z.number(),
      dealId: z.number(),
      status: z.enum(["pending", "received", "rejected"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const receivedAt = input.status === "received" ? new Date() : undefined;
      await updateSignaturePageStatus(input.sigId, input.dealId, input.status, receivedAt);
      await addAuditEntry(input.dealId, ctx.user.id, ctx.user.name, "signature_status_updated", { toValue: input.status });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ sigId: z.number(), dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteSignaturePage(input.sigId, input.dealId);
      return { success: true };
    }),
});

// ─── Alerts ──────────────────────────────────────────────────────────────────

const alertsRouter = router({
  checkOverdue: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });

      const items = await getChecklistItems(input.dealId);
      const now = new Date();

      const overdue = items.filter(
        (i) =>
          i.deadline &&
          new Date(i.deadline) < now &&
          i.status !== "Executed" &&
          i.status !== "Waived"
      );

      const approaching = items.filter((i) => {
        if (!i.deadline || i.status === "Executed" || i.status === "Waived") return false;
        const daysUntil = (new Date(i.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return daysUntil >= 0 && daysUntil <= 3;
      });

      const dealClosingOverdue =
        deal.closingDate && new Date(deal.closingDate) < now;
      const daysToClosing = deal.closingDate
        ? Math.ceil((new Date(deal.closingDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      if (overdue.length > 0 || approaching.length > 0 || dealClosingOverdue) {
        const lines: string[] = [];
        if (dealClosingOverdue) lines.push(`⚠️ Deal closing date has passed for "${deal.name}"`);
        if (daysToClosing !== null && daysToClosing >= 0 && daysToClosing <= 3)
          lines.push(`⏰ Closing date for "${deal.name}" is in ${daysToClosing} day(s)`);
        if (overdue.length > 0)
          lines.push(`🔴 ${overdue.length} overdue item(s): ${overdue.map((i) => i.title).join(", ")}`);
        if (approaching.length > 0)
          lines.push(`🟡 ${approaching.length} item(s) due within 3 days: ${approaching.map((i) => i.title).join(", ")}`);

        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `ClosingRoom Alert — ${deal.name}`,
          content: lines.join("\n"),
        });
      }

      return {
        overdueCount: overdue.length,
        approachingCount: approaching.length,
        overdueItems: overdue.map((i) => ({ id: i.id, title: i.title, deadline: i.deadline })),
        approachingItems: approaching.map((i) => ({ id: i.id, title: i.title, deadline: i.deadline })),
        dealClosingOverdue: !!dealClosingOverdue,
        daysToClosing,
      };
    }),

  getOverdueSummary: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) return { overdueCount: 0, approachingCount: 0, daysToClosing: null, dealClosingOverdue: false };

      const items = await getChecklistItems(input.dealId);
      const now = new Date();

      const overdueCount = items.filter(
        (i) => i.deadline && new Date(i.deadline) < now && i.status !== "Executed" && i.status !== "Waived"
      ).length;

      const approachingCount = items.filter((i) => {
        if (!i.deadline || i.status === "Executed" || i.status === "Waived") return false;
        const daysUntil = (new Date(i.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return daysUntil >= 0 && daysUntil <= 3;
      }).length;

      const dealClosingOverdue = deal.closingDate ? new Date(deal.closingDate) < now : false;
      const daysToClosing = deal.closingDate
        ? Math.ceil((new Date(deal.closingDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return { overdueCount, approachingCount, daysToClosing, dealClosingOverdue };
    }),
});

// ─── Members Router ─────────────────────────────────────────────────────────────

const MEMBER_ROLE = z.enum(["admin", "editor", "viewer"]);

const membersRouter = router({
  /** List all members (accepted + pending) for a deal */
  list: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const members = await getDealMembers(input.dealId);
      // Touch lastAccessedAt for the current user
      await touchDealMemberAccess(input.dealId, ctx.user.id);
      // Return members plus the owner as a synthetic entry
      return {
        ownerId: deal.userId,
        members,
      };
    }),

  /** Invite a colleague by email */
  invite: protectedProcedure
    .input(z.object({
      dealId: z.number(),
      email: z.string().email(),
      role: MEMBER_ROLE,
      origin: z.string(), // frontend passes window.location.origin
    }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      // Only owner or admin can invite
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole !== "owner" && accessRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can invite members" });
      }
      // Check for duplicate
      const existing = await getDealMemberByEmail(input.dealId, input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "This email has already been invited to this deal" });
      // Generate a secure token
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await createDealInvite(input.dealId, input.email, input.role as MemberRole, token, ctx.user.id);
      const inviteUrl = `${input.origin}/invite/${token}`;
      return { inviteUrl, token };
    }),

  /** Remove a member from a deal */
  remove: protectedProcedure
    .input(z.object({ dealId: z.number(), memberId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole !== "owner" && accessRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can remove members" });
      }
      await removeDealMember(input.dealId, input.memberId);
      return { success: true };
    }),

  /** Update a member's role */
  updateRole: protectedProcedure
    .input(z.object({ dealId: z.number(), memberId: z.number(), role: MEMBER_ROLE }))
    .mutation(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const accessRole = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (accessRole !== "owner" && accessRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can change roles" });
      }
      await updateDealMemberRole(input.dealId, input.memberId, input.role as MemberRole);
      return { success: true };
    }),

  /** Look up an invite by token (public — used on the accept page before login) */
  getInvite: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const member = await getDealMemberByToken(input.token);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or already used" });
      return {
        id: member.id,
        dealId: member.dealId,
        email: member.email,
        role: member.memberRole,
        inviteStatus: member.inviteStatus,
      };
    }),

  /** Accept an invite — must be called after the user is logged in */
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const member = await getDealMemberByToken(input.token);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or already used" });
      if (member.inviteStatus === "accepted") {
        // Already accepted — just return the dealId so the frontend can redirect
        return { dealId: member.dealId };
      }
      // Accept the invite, linking to the current user
      await acceptDealInvite(
        input.token,
        ctx.user.id,
        ctx.user.name ?? ctx.user.email ?? "Team member",
        ctx.user.email ?? member.email
      );
      await addAuditEntry(member.dealId, ctx.user.id, ctx.user.name ?? "Team member", "member_joined", { metadata: `${ctx.user.email ?? member.email} joined as ${member.memberRole}` });
      return { dealId: member.dealId };
    }),

  /** Get the current user's role on a deal */
  myRole: protectedProcedure
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND" });
      const role = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      return { role, isOwner: deal.userId === ctx.user.id };
    }),
});

// ─── Slack Intake Review ──────────────────────────────────────────────────────

const intakeStatus = z.enum(["received", "drafted", "approved", "rejected", "posted", "failed"]);

async function assertCanReviewIntake(userId: number, intakeId: number) {
  const intake = await getSlackIntakeById(intakeId);
  if (!intake) throw new TRPCError({ code: "NOT_FOUND", message: "Intake not found" });
  if (!intake.teamId || !intake.ownerUserId) throw new TRPCError({ code: "FORBIDDEN", message: "Intake has no verified workspace scope" });
  const link = await getSlackWorkspaceLink(intake.teamId);
  if (!link || link.ownerUserId !== intake.ownerUserId) throw new TRPCError({ code: "FORBIDDEN", message: "Slack workspace connection is unavailable" });
  if (intake.dealId) {
    const scopedDeal = await getSlackWorkspaceDealById(intake.teamId, intake.ownerUserId, intake.dealId);
    if (!scopedDeal) throw new TRPCError({ code: "FORBIDDEN", message: "Deal is outside this intake's workspace" });
    const deal = await getDealById(intake.dealId, userId);
    if (!deal) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this intake" });
    const role = await getDealAccessRole(intake.dealId, userId, deal.userId);
    if (role !== "owner" && role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only deal admins can review Slack intakes" });
  } else if (userId !== intake.ownerUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the linked account owner can review unassigned Slack intakes" });
  }
  return intake;
}

const intakeRouter = router({
  list: protectedProcedure
    .input(z.object({ status: intakeStatus.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const intakes = await listSlackIntakes(input?.status);
      const visible = await Promise.all(intakes.map(async (intake) => {
        try {
          await assertCanReviewIntake(ctx.user.id, intake.id);
          const deal = intake.dealId ? await getDealById(intake.dealId, ctx.user.id) : undefined;
          return { ...intake, dealName: deal?.name ?? null };
        } catch { return null; }
      }));
      return visible.filter((intake): intake is NonNullable<typeof intake> => intake !== null);
    }),

  get: protectedProcedure
    .input(z.object({ intakeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const intake = await assertCanReviewIntake(ctx.user.id, input.intakeId);
      const deal = intake.dealId ? await getDealById(intake.dealId, ctx.user.id) : null;
      return { intake, deal };
    }),

  linkDeal: protectedProcedure
    .input(z.object({ intakeId: z.number(), dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const intake = await assertCanReviewIntake(ctx.user.id, input.intakeId);
      const deal = await getDealById(input.dealId, ctx.user.id);
      if (!deal) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found" });
      if (!await getSlackWorkspaceDealById(intake.teamId!, intake.ownerUserId!, deal.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Deal is outside this intake's workspace" });
      }
      const role = await getDealAccessRole(input.dealId, ctx.user.id, deal.userId);
      if (role !== "owner" && role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only deal admins can link an intake" });
      await linkSlackIntakeToDeal(intake.id, deal.id);
      await addAuditEntry(deal.id, ctx.user.id, ctx.user.name, "slack_intake_linked", { metadata: `Intake ${intake.id}` });
      return { success: true };
    }),

  approve: protectedProcedure
    .input(z.object({ intakeId: z.number(), response: z.string().min(1), reviewNote: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const intake = await assertCanReviewIntake(ctx.user.id, input.intakeId);
      if (intake.status === "posted" || intake.status === "rejected") throw new TRPCError({ code: "CONFLICT", message: "This intake has already been closed" });
      let response: string;
      try {
        response = assertBusinessFacingResponse(input.response, intake.reviewerNotes ?? "");
        const scopedDeal = intake.dealId ? await getSlackWorkspaceDealById(intake.teamId!, intake.ownerUserId!, intake.dealId) : undefined;
        assertLongstopDateAccuracy(response, scopedDeal);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Enter only the business-facing response." });
      }
      await approveSlackIntake(input.intakeId, ctx.user.id, response, input.reviewNote);
      let posted = false;
      try {
        await postApprovedSlackResponse(input.intakeId);
        posted = true;
      } catch (error) {
        console.error("[Slack intake] approved response could not be posted", error);
      }
      if (intake.dealId) await addAuditEntry(intake.dealId, ctx.user.id, ctx.user.name, "slack_intake_approved", { metadata: `Intake ${input.intakeId}${posted ? " posted" : " approved; Slack post pending"}` });
      return { success: true, posted };
    }),

  reject: protectedProcedure
    .input(z.object({ intakeId: z.number(), reviewNote: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const intake = await assertCanReviewIntake(ctx.user.id, input.intakeId);
      await rejectSlackIntake(input.intakeId, ctx.user.id, input.reviewNote);
      if (intake.dealId) await addAuditEntry(intake.dealId, ctx.user.id, ctx.user.name, "slack_intake_rejected", { metadata: `Intake ${input.intakeId}` });
      return { success: true };
    }),
});

// ─── App Router ─────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  deals: dealsRouter,
  items: itemsRouter,
  chat: chatRouter,
  threads: threadsRouter,
  documents: documentsRouter,
  audit: auditRouter,
  signatures: signaturesRouter,
  alerts: alertsRouter,
  members: membersRouter,
  intake: intakeRouter,
});

export type AppRouter = typeof appRouter;
