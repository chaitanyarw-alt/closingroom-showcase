import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, varchar, text, timestamp, mysqlEnum, bigint, index, tinyint, uniqueIndex } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const auditLog = mysqlTable("audit_log", {
	id: int().autoincrement().notNull(),
	dealId: int().notNull(),
	itemId: int(),
	userId: int().notNull(),
	userName: varchar({ length: 255 }),
	action: varchar({ length: 128 }).notNull(),
	fromValue: varchar({ length: 512 }),
	toValue: varchar({ length: 512 }),
	metadata: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const chatMessages = mysqlTable("chat_messages", {
	id: int().autoincrement().notNull(),
	dealId: int().notNull(),
	role: mysqlEnum(['user','assistant']).notNull(),
	content: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const checklistItems = mysqlTable("checklist_items", {
	id: int().autoincrement().notNull(),
	dealId: int().notNull(),
	section: mysqlEnum(['conditions_precedent','transaction_documents','post_closing']).notNull(),
	title: varchar({ length: 512 }).notNull(),
	status: mysqlEnum(['Executed','Under Review','Outstanding','Waived']).default('Under Review').notNull(),
	notes: text(),
	sortOrder: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	party: mysqlEnum(['buyer_counsel','seller_counsel','bank','all','other']).default('all').notNull(),
	assigneeUserId: int(),
	deadline: timestamp({ mode: 'string' }),
	partyLabel: varchar({ length: 255 }),
	partyCustom: varchar({ length: 255 }),
	partiesJson: text(),
	statusChangedAt: bigint({ mode: "number" }),
});

export const dealMembers = mysqlTable("deal_members", {
	id: int().autoincrement().notNull(),
	dealId: int().notNull(),
	// userId is null until the invite is accepted
	userId: int(),
	// email of the invitee (used to match when they sign in)
	email: varchar({ length: 320 }).notNull(),
	name: varchar({ length: 255 }),
	// role: admin = full access, editor = status + upload, viewer = read-only
	memberRole: mysqlEnum(['admin','editor','viewer']).default('viewer').notNull(),
	// invite lifecycle
	inviteToken: varchar({ length: 128 }),
	inviteStatus: mysqlEnum(['pending','accepted']).default('pending').notNull(),
	invitedByUserId: int(),
	// last time this member loaded a deal page
	lastAccessedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	uniqueIndex("deal_members_deal_email_unique").on(table.dealId, table.email),
]);

export const deals = mysqlTable("deals", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	closingDate: timestamp({ mode: 'string' }),
	targetCompany: varchar({ length: 255 }),
	dealStructure: varchar({ length: 128 }),
	dealStructureOther: varchar({ length: 255 }),
	dealValue: varchar({ length: 255 }),
	governingLaw: varchar({ length: 255 }),
	longstopDate: timestamp({ mode: 'string' }),
	buyerName: varchar({ length: 255 }),
	sellerName: varchar({ length: 255 }),
	buyerCounsel: varchar({ length: 255 }),
	sellerCounsel: varchar({ length: 255 }),
	lastViewedAt: timestamp({ mode: 'string' }),
	archivedAt: bigint({ mode: "number" }),
	deletedAt: bigint({ mode: "number" }),
	isTestData: tinyint().default(0).notNull(),
	isSeedData: tinyint().default(0).notNull(),
});

export const documents = mysqlTable("documents", {
	id: int().autoincrement().notNull(),
	dealId: int().notNull(),
	uploadedByUserId: int().notNull(),
	filename: varchar({ length: 512 }).notNull(),
	storageKey: varchar({ length: 1024 }).notNull(),
	mimeType: varchar({ length: 128 }).notNull(),
	sizeBytes: int().notNull(),
	extractedText: text(),
	aiProcessed: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	checklistItemId: int(),
});

export const signaturePages = mysqlTable("signature_pages", {
	id: int().autoincrement().notNull(),
	dealId: int().notNull(),
	itemId: int(),
	signatoryName: varchar({ length: 255 }).notNull(),
	signatoryParty: varchar({ length: 128 }).notNull(),
	method: mysqlEnum(['wet_ink','electronic','counterpart']).default('electronic').notNull(),
	status: mysqlEnum(['pending','received','rejected']).default('pending').notNull(),
	receivedAt: timestamp({ mode: 'string' }),
	notes: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);

export const waiverRecords = mysqlTable("waiver_records", {
	id: int().autoincrement().notNull(),
	itemId: int().notNull(),
	dealId: int().notNull(),
	approvedByUserId: int().notNull(),
	approvedByName: varchar({ length: 255 }),
	approvedByParty: mysqlEnum(['buyer_counsel','seller_counsel','bank','owner']).notNull(),
	reason: text().notNull(),
	waivedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const conversationThreads = mysqlTable("conversation_threads", {
	id: int().autoincrement().notNull(),
	dealId: int().notNull(),
	userId: int().notNull(),
	title: varchar({ length: 512 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const conversationMessages = mysqlTable("conversation_messages", {
	id: int().autoincrement().notNull(),
	threadId: int().notNull(),
	role: mysqlEnum(['user','assistant']).notNull(),
	content: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const slackWorkspaceLinks = mysqlTable("slack_workspace_links", {
	teamId: varchar({ length: 64 }).primaryKey(),
	ownerUserId: int().notNull(),
	enabled: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const slackIntakes = mysqlTable("slack_intakes", {
	id: int().autoincrement().notNull(),
	dealId: int(),
	teamId: varchar({ length: 64 }),
	ownerUserId: int(),
	channelId: varchar({ length: 64 }).notNull(),
	threadTs: varchar({ length: 64 }),
	requesterSlackUserId: varchar({ length: 64 }),
	requesterName: varchar({ length: 255 }),
	question: text().notNull(),
	aiDraft: text(),
	response: text(),
	reviewerNotes: text(),
	approvedResponse: text(),
	status: mysqlEnum(['received','drafted','approved','rejected','posted','failed']).default('received').notNull(),
	reviewerUserId: int(),
	reviewNote: text(),
	errorMessage: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	reviewedAt: timestamp({ mode: 'string' }),
	postedAt: timestamp({ mode: 'string' }),
},
	(table) => [
		index("slack_intakes_status_idx").on(table.status),
		index("slack_intakes_deal_idx").on(table.dealId),
	]
);
