import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLog,
  chatMessages,
  checklistItems,
  conversationMessages,
  conversationThreads,
  dealMembers,
  deals,
  documents,
  InsertUser,
	signaturePages,
	slackIntakes,
	slackWorkspaceLinks,
	users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { assertBusinessFacingResponse, type SlackDraft } from "./slackDraft";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? undefined;
}

// ─── Deals ────────────────────────────────────────────────────────────────────

export function activeDealPredicate() {
  return and(isNull(deals.archivedAt), isNull(deals.deletedAt), eq(deals.isTestData, 0), eq(deals.isSeedData, 0));
}

export function slackWorkspacePredicate(teamId: string, ownerUserId: number) {
  return and(eq(slackWorkspaceLinks.teamId, teamId), eq(slackWorkspaceLinks.enabled, 1),
    eq(slackWorkspaceLinks.ownerUserId, ownerUserId), eq(deals.userId, ownerUserId), activeDealPredicate());
}

function validSlackScope(teamId: string, ownerUserId: number) {
  return typeof teamId === "string" && /^T[A-Z0-9]+$/.test(teamId)
    && Number.isSafeInteger(ownerUserId) && ownerUserId > 0;
}

export async function getSlackWorkspaceLink(teamId: string) {
  if (typeof teamId !== "string" || !/^T[A-Z0-9]+$/.test(teamId)) return undefined;
  const db = await getDb();
  if (!db) throw new Error("Slack workspace database is unavailable");
  const rows = await db.select({ teamId: slackWorkspaceLinks.teamId, ownerUserId: slackWorkspaceLinks.ownerUserId })
    .from(slackWorkspaceLinks).innerJoin(users, eq(users.id, slackWorkspaceLinks.ownerUserId))
    .where(and(eq(slackWorkspaceLinks.teamId, teamId), eq(slackWorkspaceLinks.enabled, 1), gt(users.id, 0))).limit(1);
  return rows[0];
}

// No identity fallback: every deal query requires an explicit enabled team link
// AND an owner snapshot. Cross-owner membership never expands Slack's boundary.
export async function getSlackWorkspaceDeals(teamId: string, ownerUserId: number) {
  if (!validSlackScope(teamId, ownerUserId)) return [];
  const db = await getDb();
  if (!db) throw new Error("Slack workspace database is unavailable");
  return db.select({ id: deals.id, name: deals.name }).from(deals)
    .innerJoin(slackWorkspaceLinks, eq(slackWorkspaceLinks.ownerUserId, deals.userId))
    .innerJoin(users, eq(users.id, slackWorkspaceLinks.ownerUserId))
    .where(slackWorkspacePredicate(teamId, ownerUserId)).orderBy(asc(deals.name));
}

export async function getSlackWorkspaceDealById(teamId: string, ownerUserId: number, dealId: number) {
  if (!validSlackScope(teamId, ownerUserId) || !Number.isSafeInteger(dealId) || dealId <= 0) return undefined;
  const db = await getDb();
  if (!db) throw new Error("Slack workspace database is unavailable");
  const rows = await db.select({ deal: deals }).from(deals)
    .innerJoin(slackWorkspaceLinks, eq(slackWorkspaceLinks.ownerUserId, deals.userId))
    .innerJoin(users, eq(users.id, slackWorkspaceLinks.ownerUserId))
    .where(and(eq(deals.id, dealId), slackWorkspacePredicate(teamId, ownerUserId))).limit(1);
  return rows[0]?.deal;
}

export async function getDealsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(deals).where(and(eq(deals.userId, userId), activeDealPredicate())).orderBy(asc(deals.createdAt));
}

export async function getAllDealsForDashboard(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Owner sees their own deals; also deals they are a member of
  const ownDeals = await db.select().from(deals).where(and(eq(deals.userId, userId), activeDealPredicate())).orderBy(asc(deals.createdAt));
  const memberDealIds = await db.select({ dealId: dealMembers.dealId }).from(dealMembers).where(eq(dealMembers.userId, userId));
  const memberIds = memberDealIds.map((m) => m.dealId).filter((id) => !ownDeals.find((d) => d.id === id));
  if (memberIds.length === 0) return ownDeals;
  // Fetch member deals individually (MySQL IN clause workaround)
  const memberDeals = await Promise.all(memberIds.map((id) => db.select().from(deals).where(and(eq(deals.id, id), activeDealPredicate())).limit(1)));
  return [...ownDeals, ...memberDeals.flat()];
}

export async function getDealById(dealId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  // Allow owner or member
  const result = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  const deal = result[0];
  if (!deal) return undefined;
  if (deal.userId === userId) return deal;
  // Check membership (only accepted invites grant access)
  const member = await db.select().from(dealMembers).where(
    and(eq(dealMembers.dealId, dealId), eq(dealMembers.userId, userId), eq(dealMembers.inviteStatus, "accepted"))
  ).limit(1);
  if (member.length > 0) return deal;
  return undefined;
}

export interface DealFields {
  name: string;
  description?: string;
  closingDate?: Date;
  targetCompany?: string;
  dealStructure?: string;
  dealStructureOther?: string;
  dealValue?: string;
  governingLaw?: string;
  longstopDate?: Date;
  buyerName?: string;
  sellerName?: string;
  buyerCounsel?: string;
  sellerCounsel?: string;
}

export async function createDeal(userId: number, fields: DealFields) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(deals).values({
    userId,
    name: fields.name,
    description: fields.description ?? null,
    closingDate: fields.closingDate ?? null,
    targetCompany: fields.targetCompany ?? null,
    dealStructure: fields.dealStructure ?? null,
    dealStructureOther: fields.dealStructureOther ?? null,
    dealValue: fields.dealValue ?? null,
    governingLaw: fields.governingLaw ?? null,
    longstopDate: fields.longstopDate ?? null,
    buyerName: fields.buyerName ?? null,
    sellerName: fields.sellerName ?? null,
    buyerCounsel: fields.buyerCounsel ?? null,
    sellerCounsel: fields.sellerCounsel ?? null,
  });
  return (result as { insertId: number }).insertId;
}

export async function updateDeal(dealId: number, userId: number, fields: Partial<DealFields>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const setValues: Record<string, unknown> = {};
  if (fields.name !== undefined) setValues.name = fields.name;
  if (fields.description !== undefined) setValues.description = fields.description ?? null;
  if (fields.closingDate !== undefined) setValues.closingDate = fields.closingDate ?? null;
  if (fields.targetCompany !== undefined) setValues.targetCompany = fields.targetCompany ?? null;
  if (fields.dealStructure !== undefined) setValues.dealStructure = fields.dealStructure ?? null;
  if (fields.dealStructureOther !== undefined) setValues.dealStructureOther = fields.dealStructureOther ?? null;
  if (fields.dealValue !== undefined) setValues.dealValue = fields.dealValue ?? null;
  if (fields.governingLaw !== undefined) setValues.governingLaw = fields.governingLaw ?? null;
  if (fields.longstopDate !== undefined) setValues.longstopDate = fields.longstopDate ?? null;
  if (fields.buyerName !== undefined) setValues.buyerName = fields.buyerName ?? null;
  if (fields.sellerName !== undefined) setValues.sellerName = fields.sellerName ?? null;
  if (fields.buyerCounsel !== undefined) setValues.buyerCounsel = fields.buyerCounsel ?? null;
  if (fields.sellerCounsel !== undefined) setValues.sellerCounsel = fields.sellerCounsel ?? null;
  await db.update(deals).set(setValues).where(and(eq(deals.id, dealId), eq(deals.userId, userId)));
}

export async function deleteDeal(dealId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(auditLog).where(eq(auditLog.dealId, dealId));
  await db.delete(signaturePages).where(eq(signaturePages.dealId, dealId));
  await db.delete(documents).where(eq(documents.dealId, dealId));
  await db.delete(dealMembers).where(eq(dealMembers.dealId, dealId));
  await db.delete(chatMessages).where(eq(chatMessages.dealId, dealId));
  await db.delete(checklistItems).where(eq(checklistItems.dealId, dealId));
  await db.delete(deals).where(and(eq(deals.id, dealId), eq(deals.userId, userId)));
}

// ─── Deal Team ─────────────────────────────────────────────────────────────

export type MemberRole = "admin" | "editor" | "viewer";

export async function getDealMembers(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dealMembers).where(eq(dealMembers.dealId, dealId)).orderBy(asc(dealMembers.createdAt));
}

/** Returns the member record for a given user on a deal, or null if not a member */
export async function getDealMember(dealId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dealMembers).where(
    and(eq(dealMembers.dealId, dealId), eq(dealMembers.userId, userId))
  ).limit(1);
  return rows[0] ?? null;
}

/** Returns the member record for a given email on a deal, or null */
export async function getDealMemberByEmail(dealId: number, email: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dealMembers).where(
    and(eq(dealMembers.dealId, dealId), eq(dealMembers.email, email))
  ).limit(1);
  return rows[0] ?? null;
}

/** Returns the member record for a given invite token, or null */
export async function getDealMemberByToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(dealMembers).where(eq(dealMembers.inviteToken, token)).limit(1);
  return rows[0] ?? null;
}

/** Create a pending invite record */
export async function createDealInvite(
  dealId: number,
  email: string,
  memberRole: MemberRole,
  inviteToken: string,
  invitedByUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(dealMembers).values({
    dealId,
    email,
    memberRole,
    inviteToken,
    inviteStatus: "pending",
    invitedByUserId,
  });
  return (result as { insertId: number }).insertId;
}

/** Accept an invite: link the userId, set name, mark accepted */
export async function acceptDealInvite(token: string, userId: number, name: string, email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dealMembers)
    .set({ userId, name, email, inviteStatus: "accepted", inviteToken: null })
    .where(eq(dealMembers.inviteToken, token));
}

export async function removeDealMember(dealId: number, memberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(dealMembers).where(and(eq(dealMembers.dealId, dealId), eq(dealMembers.id, memberId)));
}

export async function updateDealMemberRole(dealId: number, memberId: number, memberRole: MemberRole) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(dealMembers).set({ memberRole }).where(and(eq(dealMembers.dealId, dealId), eq(dealMembers.id, memberId)));
}

/** Update the lastAccessedAt timestamp for a member */
export async function touchDealMemberAccess(dealId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await db.update(dealMembers)
    .set({ lastAccessedAt: now })
    .where(and(eq(dealMembers.dealId, dealId), eq(dealMembers.userId, userId)));
}

/** Check if a user is the deal owner (userId on deals table) or an accepted admin member */
export async function getDealAccessRole(dealId: number, userId: number, dealOwnerId: number): Promise<"owner" | MemberRole | null> {
  if (userId === dealOwnerId) return "owner";
  const member = await getDealMember(dealId, userId);
  if (!member || member.inviteStatus !== "accepted") return null;
  return member.memberRole as MemberRole;
}

// ─── Checklist Items ──────────────────────────────────────────────────────────

export async function getChecklistItems(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(checklistItems).where(eq(checklistItems.dealId, dealId)).orderBy(asc(checklistItems.sortOrder), asc(checklistItems.id));
}

export async function createChecklistItem(
  dealId: number,
  section: "conditions_precedent" | "transaction_documents" | "post_closing",
  title: string,
  sortOrder: number,
  party: "buyer_counsel" | "seller_counsel" | "bank" | "all" | "other" = "all",
  status: "Executed" | "Under Review" | "Outstanding" | "Waived" = "Under Review",
  partyLabel?: string,
  partyCustom?: string,
  partiesJson?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(checklistItems).values({ dealId, section, title, status, sortOrder, party, partyLabel, partyCustom, partiesJson: partiesJson ?? null, statusChangedAt: Date.now() });
  return (result as { insertId: number }).insertId;
}

export async function updateItemStatus(
  itemId: number,
  dealId: number,
  status: "Executed" | "Under Review" | "Outstanding" | "Waived"
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(checklistItems).set({ status, statusChangedAt: Date.now() }).where(and(eq(checklistItems.id, itemId), eq(checklistItems.dealId, dealId)));
}

export async function updateItemNotes(itemId: number, dealId: number, notes: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(checklistItems).set({ notes }).where(and(eq(checklistItems.id, itemId), eq(checklistItems.dealId, dealId)));
}

export async function updateItemDeadline(itemId: number, dealId: number, deadline: Date | null, assigneeUserId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(checklistItems).set({ deadline, assigneeUserId }).where(and(eq(checklistItems.id, itemId), eq(checklistItems.dealId, dealId)));
}

export async function deleteChecklistItem(itemId: number, dealId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(checklistItems).where(and(eq(checklistItems.id, itemId), eq(checklistItems.dealId, dealId)));
}

export async function updateItemTitle(itemId: number, dealId: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(checklistItems).set({ title }).where(and(eq(checklistItems.id, itemId), eq(checklistItems.dealId, dealId)));
}

export async function updateItemParty(
  itemId: number,
  dealId: number,
  party: "buyer_counsel" | "seller_counsel" | "bank" | "all" | "other",
  partyLabel?: string,
  partyCustom?: string,
  partiesJson?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(checklistItems)
    .set({ party, partyLabel: partyLabel ?? null, partyCustom: partyCustom ?? null, partiesJson: partiesJson ?? null })
    .where(and(eq(checklistItems.id, itemId), eq(checklistItems.dealId, dealId)));
}

// ─── Chat Messages ────────────────────────────────────────────────────────────

export async function getChatHistory(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chatMessages).where(eq(chatMessages.dealId, dealId)).orderBy(asc(chatMessages.createdAt));
}

export async function saveChatMessage(dealId: number, role: "user" | "assistant", content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(chatMessages).values({ dealId, role, content });
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function getDocuments(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.dealId, dealId)).orderBy(desc(documents.createdAt));
}

export async function createDocument(
  dealId: number,
  uploadedByUserId: number,
  filename: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  checklistItemId?: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(documents).values({ dealId, uploadedByUserId, filename, storageKey, mimeType, sizeBytes, aiProcessed: false, checklistItemId: checklistItemId ?? null });
  return (result as { insertId: number }).insertId;
}
export async function getDocumentsByItem(dealId: number, checklistItemId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(and(eq(documents.dealId, dealId), eq(documents.checklistItemId, checklistItemId))).orderBy(desc(documents.createdAt));
}

export async function linkDocumentToItem(docId: number, dealId: number, checklistItemId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documents).set({ checklistItemId }).where(and(eq(documents.id, docId), eq(documents.dealId, dealId)));
}

export async function updateDocumentStorageKey(docId: number, storageKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documents).set({ storageKey }).where(eq(documents.id, docId));
}

export async function updateDocumentExtraction(docId: number, extractedText: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documents).set({ extractedText, aiProcessed: true }).where(eq(documents.id, docId));
}

export async function deleteDocument(docId: number, dealId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(documents).where(and(eq(documents.id, docId), eq(documents.dealId, dealId)));
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export async function addAuditEntry(
  dealId: number,
  userId: number,
  userName: string | null,
  action: string,
  options?: { itemId?: number; fromValue?: string; toValue?: string; metadata?: string }
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values({
    dealId,
    userId,
    userName,
    action,
    itemId: options?.itemId ?? null,
    fromValue: options?.fromValue ?? null,
    toValue: options?.toValue ?? null,
    metadata: options?.metadata ?? null,
  });
}

export async function getAuditLog(dealId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLog).where(eq(auditLog.dealId, dealId)).orderBy(desc(auditLog.createdAt)).limit(limit);
}

// ─── Signature Pages ──────────────────────────────────────────────────────────

export async function getSignaturePages(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(signaturePages).where(eq(signaturePages.dealId, dealId)).orderBy(asc(signaturePages.createdAt));
}

export async function createSignaturePage(
  dealId: number,
  signatoryName: string,
  signatoryParty: string,
  method: "wet_ink" | "electronic" | "counterpart",
  itemId?: number,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(signaturePages).values({ dealId, signatoryName, signatoryParty, method, status: "pending", itemId: itemId ?? null, notes: notes ?? null });
  return (result as { insertId: number }).insertId;
}

export async function updateSignaturePageStatus(
  sigId: number,
  dealId: number,
  status: "pending" | "received" | "rejected",
  receivedAt?: Date
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(signaturePages).set({ status, receivedAt: receivedAt ?? null }).where(and(eq(signaturePages.id, sigId), eq(signaturePages.dealId, dealId)));
}

export async function deleteSignaturePage(sigId: number, dealId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(signaturePages).where(and(eq(signaturePages.id, sigId), eq(signaturePages.dealId, dealId)));
}

export async function markDealAsViewed(dealId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(deals).set({ lastViewedAt: new Date() }).where(and(eq(deals.id, dealId), eq(deals.userId, userId)));
}

// ─── Conversation Threads ────────────────────────────────────────────────────────

export async function getConversationThreads(dealId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversationThreads).where(eq(conversationThreads.dealId, dealId)).orderBy(desc(conversationThreads.updatedAt));
}

export async function createConversationThread(dealId: number, userId: number, title?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(conversationThreads).values({ dealId, userId, title: title ?? null });
  return (result as { insertId: number }).insertId;
}

export async function updateConversationThreadTitle(threadId: number, dealId: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(conversationThreads).set({ title, updatedAt: new Date() }).where(and(eq(conversationThreads.id, threadId), eq(conversationThreads.dealId, dealId)));
}

export async function deleteConversationThread(threadId: number, dealId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(conversationMessages).where(eq(conversationMessages.threadId, threadId));
  await db.delete(conversationThreads).where(and(eq(conversationThreads.id, threadId), eq(conversationThreads.dealId, dealId)));
}

// ─── Conversation Messages ────────────────────────────────────────────────────────

export async function getConversationMessages(threadId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversationMessages).where(eq(conversationMessages.threadId, threadId)).orderBy(asc(conversationMessages.createdAt));
}

export async function saveConversationMessage(threadId: number, role: "user" | "assistant", content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(conversationMessages).values({ threadId, role, content });
}

// ─── Slack Intake Workflow ───────────────────────────────────────────────────

export type SlackIntakeStatus = "received" | "drafted" | "approved" | "rejected" | "posted" | "failed";

export async function createSlackIntake(input: {
  teamId: string;
  ownerUserId: number;
  channelId: string;
  threadTs?: string;
  requesterSlackUserId?: string;
  requesterName?: string;
  question: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const link = await getSlackWorkspaceLink(input.teamId);
  if (!link || link.ownerUserId !== input.ownerUserId) throw new Error("Slack workspace connection changed; intake rejected");
  const [result] = await db.insert(slackIntakes).values({
    teamId: input.teamId,
    ownerUserId: input.ownerUserId,
    channelId: input.channelId,
    threadTs: input.threadTs ?? null,
    requesterSlackUserId: input.requesterSlackUserId ?? null,
    requesterName: input.requesterName ?? null,
    question: input.question,
    status: "received",
  });
  return (result as { insertId: number }).insertId;
}

export async function getSlackIntakeById(intakeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(slackIntakes).where(eq(slackIntakes.id, intakeId)).limit(1);
  return rows[0] ?? undefined;
}

export async function listSlackIntakes(status?: SlackIntakeStatus) {
  const db = await getDb();
  if (!db) return [];
  const query = status
    ? db.select().from(slackIntakes).where(eq(slackIntakes.status, status))
    : db.select().from(slackIntakes);
  return query.orderBy(desc(slackIntakes.createdAt));
}

export async function updateSlackIntakeDraft(intakeId: number, draft: SlackDraft) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const response = assertBusinessFacingResponse(draft.response, draft.reviewer_notes);
  await db.update(slackIntakes).set({ response, reviewerNotes: draft.reviewer_notes,
    status: "drafted", errorMessage: null }).where(eq(slackIntakes.id, intakeId));
}

export async function linkSlackIntakeToDeal(intakeId: number, dealId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const intake = await getSlackIntakeById(intakeId);
  if (!intake?.teamId || !intake.ownerUserId) throw new Error("Slack intake has no verified workspace scope");
  const deal = await getSlackWorkspaceDealById(intake.teamId, intake.ownerUserId, dealId);
  if (!deal) throw new Error("Selected deal is not available to this Slack workspace");
  // Revalidate ownership, eligibility and mapping inside the linking statement.
  const [result] = await db.update(slackIntakes).set({ dealId }).where(and(
    eq(slackIntakes.id, intakeId), eq(slackIntakes.teamId, intake.teamId), eq(slackIntakes.ownerUserId, intake.ownerUserId),
    sql`exists (select 1 from ${deals} inner join ${slackWorkspaceLinks} on ${slackWorkspaceLinks.ownerUserId} = ${deals.userId}
      inner join ${users} on ${users.id} = ${slackWorkspaceLinks.ownerUserId}
      where ${deals.id} = ${dealId} and ${slackWorkspacePredicate(intake.teamId, intake.ownerUserId)})`,
  ));
  if (!(result as { affectedRows: number }).affectedRows) throw new Error("Slack intake scope changed; linking rejected");
}

export async function approveSlackIntake(intakeId: number, reviewerUserId: number, response: string, reviewNote?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const intake = await getSlackIntakeById(intakeId);
  if (!intake) throw new Error("Intake not found");
  const businessResponse = assertBusinessFacingResponse(response, intake.reviewerNotes ?? "");
  await db.update(slackIntakes).set({
    response: businessResponse,
    approvedResponse: businessResponse,
    reviewerUserId,
    reviewNote: reviewNote ?? null,
    status: "approved",
    reviewedAt: new Date(),
  }).where(eq(slackIntakes.id, intakeId));
}

export async function rejectSlackIntake(intakeId: number, reviewerUserId: number, reviewNote?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(slackIntakes).set({
    reviewerUserId,
    reviewNote: reviewNote ?? null,
    status: "rejected",
    reviewedAt: new Date(),
  }).where(eq(slackIntakes.id, intakeId));
}

export async function markSlackIntakePosted(intakeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(slackIntakes).set({ status: "posted", postedAt: new Date() }).where(eq(slackIntakes.id, intakeId));
}

export async function markSlackIntakeFailed(intakeId: number, errorMessage: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(slackIntakes).set({ status: "failed", errorMessage }).where(eq(slackIntakes.id, intakeId));
}
