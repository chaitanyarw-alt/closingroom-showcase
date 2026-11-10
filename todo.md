# ClosingRoom — Project TODO

## Phase 1 — Core App (v1)
- [x] deals table (id, name, description, closingDate, createdAt, updatedAt, userId)
- [x] checklist_items table (id, dealId, section, title, status, order, notes, deadline, assigneeUserId, party)
- [x] chat_messages table (id, dealId, role, content, createdAt)
- [x] Run migrations via drizzle-kit migrate
- [x] deals.list / create / get / update / delete
- [x] items.updateStatus / updateNotes / create / setDeadline
- [x] chat.send / chat.history
- [x] Sidebar with deal switcher, progress bar, section nav, rename/delete
- [x] Live stats bar (Executed / Pending / Outstanding / Waived)
- [x] Three checklist sections with status dropdowns
- [x] AI chat assistant panel
- [x] Create/rename/delete deal dialogs
- [x] Professional light theme (Libre Baskerville + Inter)

## Feature 1 — Document Upload & AI Extraction
- [x] documents table (id, dealId, uploadedBy, filename, storageKey, mimeType, sizeBytes, extractedText, createdAt)
- [x] tRPC: documents.getUploadUrl / confirmUpload / extractAndPopulate / list / delete / getUrl
- [x] File upload to S3 storage via storagePut
- [x] AI reads document and extracts key information (LLM)
- [x] AI suggests new checklist items from document content
- [x] DocumentsPanel UI with upload, extraction result, and documents list

## Feature 2 — Multi-Party Access & Roles
- [x] deal_members table (id, dealId, userId, party, memberRole, createdAt)
- [x] party field on checklist_items (buyer_counsel / seller_counsel / bank / all)
- [x] tRPC: members.list / invite / remove
- [x] MembersPanel UI with invite-by-openId dialog and member list

## Feature 3 — Email & Deadline Alerts
- [x] deadline and assigneeUserId columns on checklist_items
- [x] closingDate field on deals table
- [x] tRPC: alerts.getOverdueSummary / checkOverdue
- [x] Overdue/approaching detection logic (3-day window)
- [x] Owner notification via notifyOwner when alerts triggered
- [x] Alert banner in sidebar showing overdue/approaching counts
- [x] Bell icon to manually trigger alert check

## Feature 4 — Closing Memorandum Generator
- [x] tRPC: memo.generate — AI generates formal closing memo from deal data, items, parties, documents
- [x] Full formal memorandum with all five sections (summary, CPs, docs, post-closing, waivers)
- [x] MemoPanel UI with generate button, Streamdown rendering, copy-to-clipboard

## Feature 5 — Audit Trail & Version History
- [x] audit_log table (id, dealId, userId, userName, action, itemId, fromValue, toValue, metadata, createdAt)
- [x] Audit entries logged for all key actions (status_changed, document_uploaded, cp_waived, etc.)
- [x] tRPC: audit.list
- [x] AuditPanel UI with timestamped activity timeline

## Feature 6 — CP Waiver Tracker
- [x] cp_waivers table (id, itemId, dealId, approvedByUserId, approvedByName, approvedByParty, reason, waivedAt)
- [x] tRPC: waivers.list / getForItem / record
- [x] Record waiver auto-sets item status to Waived
- [x] WaiversPanel UI with waiver dialog and recorded waivers list

## Feature 7 — Deal Dashboard (Portfolio View)
- [x] tRPC: deals.dashboard — aggregate stats for all deals
- [x] Home page redesigned as portfolio dashboard
- [x] Deal cards showing progress, at-risk count, status pills, closing date
- [x] Portfolio totals: total deals, total at-risk items, average progress
- [x] New Deal dialog with name, description, closing date

## Feature 8 — Signature Page Tracker
- [x] signature_pages table (id, dealId, itemId, signatoryName, signatoryParty, method, status, notes, createdAt)
- [x] tRPC: signatures.list / create / updateStatus
- [x] SignaturesPanel UI with add signatory dialog and status dropdowns

## Testing
- [x] 22 Vitest tests passing across 2 test files
- [x] Covers: deals CRUD, items CRUD, chat, audit, waivers, alerts, signatures, auth

## Enhancements (future)
- [ ] DocuSign / Adobe Sign integration for signature page tracker
- [ ] Email delivery via SMTP (currently uses in-app owner notifications)
- [x] Mobile/responsive layout for sidebar and chat panel
- [ ] Export closing memorandum to PDF
- [x] Deal closing date countdown widget

## Feature 9 — Slack-Integrated Intake Workflow
- [x] Slack slash command opens a structured intake modal for business queries
- [x] Signed Slack requests verified with the Slack signing secret
- [x] AI drafts a response with deal context when a deal name matches
- [x] Drafts are routed to a private lawyer review channel and ClosingRoom review queue
- [x] Lawyer can edit, approve, or reject a draft before any external post
- [x] Approved response posts back to the originating Slack channel/thread
- [x] Intake, draft, approval, rejection, and posting status stored for auditability
- [x] Deal association and approval actions recorded in the ClosingRoom audit trail
- [ ] Configure Slack App command URL: `/api/slack/commands`
- [ ] Configure Slack App interactivity URL: `/api/slack/interactions`

## Empty Checklist + Add/Edit Items
- [x] Remove all default seed items from deals.create procedure (server)
- [x] Delete existing seeded items from the database for all current deals
- [x] Add tRPC items.create procedure accepting title, section, party, status
- [x] Add tRPC items.updateTitle procedure for renaming existing items
- [x] Add tRPC items.delete procedure
- [x] Add inline "Add item" form at the bottom of each checklist section with name, party, status fields
- [x] Make item title click-to-edit inline (click name → input field, Enter/blur to save, Escape to cancel)
- [x] Pencil icon on hover next to item title
- [x] Delete (trash icon) per item with browser confirmation dialog

## Right Panel Navigation Redesign
- [x] Replace horizontal text tabs with a vertical icon-only sidebar on the left edge of the right panel
- [x] Each icon shows a tooltip on hover with the panel name
- [x] Panel content area takes full remaining width (w-80)
- [x] Active tab icon is visually highlighted (primary bg fill)

## Two-Step New Deal Modal
- [x] Extend deals table schema: targetCompany, dealStructure, dealStructureOther, dealValue, governingLaw, longstopDate, buyerName, sellerName, buyerCounsel, sellerCounsel
- [x] Generate and apply migration SQL
- [x] Update deals.create tRPC procedure to accept all new fields
- [x] Step 1: Deal Name, Target Company, Deal Structure (dropdown + Other text), Deal Value, Governing Law, Longstop Date (optional), Target Closing Date (mandatory)
- [x] Step 2: Buyer Name, Seller Name, Buyer's Counsel, Seller's Counsel
- [x] Next / Back navigation between steps
- [x] Mandatory field validation on each step before proceeding
- [x] Other deal structure text input shown conditionally
- [x] Create Deal button on Step 2 submits the full form
- [x] Preserve existing modal design and styling

## Dynamic Party Dropdown on Checklist Items
- [x] Add `partyCustom` varchar column to checklist_items table for free-text "Other" party name
- [x] Generate and apply migration SQL
- [x] Update items.updateParty tRPC procedure to accept partyCustom
- [x] Update db.ts updateItemParty helper to persist partyCustom
- [x] Pass current deal (buyerName, sellerName, buyerCounsel, sellerCounsel) as prop to ChecklistSection
- [x] Rebuild party dropdown: buyer name, seller name, buyer's counsel, seller's counsel (from deal), All Parties, Other
- [x] When Other selected: show free-text input below dropdown, save value as partyCustom
- [x] Dropdown options update dynamically when switching deals
- [x] Apply across all three sections (Conditions Precedent, Transaction Documents, Post-Closing)

## Dynamic Company Name Label in New Deal Form
- [x] Add a label mapping object for all 10 deal structures + default
- [x] Label updates instantly when deal structure dropdown changes
- [x] Default label "Company name" shown before any structure is selected
- [x] No other changes to the form or app

## Dynamic Deal Value Label in New Deal Form
- [x] Add deal value label mapping for all 10 deal structures + default
- [x] Label updates instantly when deal structure dropdown changes
- [x] Default label "Deal value / consideration" before any structure selected
- [x] No other changes to the form or app

## Dynamic Longstop Date Label in New Deal Form
- [x] Add longstop date label mapping: Merger → "Termination date", all others → "Longstop date"
- [x] Label updates instantly when deal structure dropdown changes
- [x] Default label "Longstop date" before any structure selected
- [x] Field remains optional for all deal structures
- [x] No other changes to the form or app

## Dynamic Target Closing Date Label in New Deal Form
- [x] Add target closing date label mapping: Merger → "Target effective date", Joint Venture → "Target establishment date", all others → "Target closing date"
- [x] Label updates instantly when deal structure dropdown changes
- [x] Default label "Target closing date" before any structure selected
- [x] Field remains mandatory for all deal structures
- [x] No other changes to the form or app

## Multi-Select Party Assignment on Checklist Items
- [x] Extend checklist_items schema: add `parties` JSON/text column to store array of selected party names
- [x] Generate and apply migration SQL
- [x] Update items.create and items.updateParty tRPC procedures to accept parties array
- [x] Update db.ts helpers to persist and retrieve parties array
- [x] Build PartyMultiSelect component: dropdown with checkboxes, tag chips with x-remove, All Parties override
- [x] Other option shows free-text input; custom name added as a tag
- [x] All Parties selection clears individual selections and selects all named parties
- [x] Wire PartyMultiSelect into ChecklistSection (add form and existing item row)
- [x] Apply across all three sections

## Party Filter on Checklist
- [x] Add a filter bar above the checklist sections in DealPage showing all assigned parties for the current deal
- [x] "All" pill selected by default; clicking a party pill filters items to only those assigned to that party
- [x] Filter applies across all three sections simultaneously
- [x] Sections with zero visible items after filtering are hidden (or show a "no items match" message)
- [x] Filter state is local (no server round-trip needed — filter on the client)
- [x] Clear / reset filter button when a filter is active
- [x] No other changes to the app

## Consistent New Deal Modal Across App
- [x] Extract the two-step New Deal modal from Home.tsx into a shared NewDealModal component
- [x] Replace the old one-step "New Deal" dialog in Sidebar.tsx with the shared NewDealModal
- [x] Wire the Sidebar's "New Deal" dropdown item to open the shared modal and navigate to the new deal on success
- [x] Ensure Home.tsx Dashboard still uses the same shared modal (no behaviour change)
- [x] No other changes to the app

## Auto-clear New Deal Form on Success
- [x] Reset all form fields (step, s1, s2, errors) immediately when a deal is successfully created, not after a delay

## Clickable Status Card Filters
- [x] Add statusFilter state (null | "Executed" | "Pending" | "Outstanding" | "Waived") to DealPage
- [x] Update filteredItems useMemo to apply both partyFilter and statusFilter simultaneously
- [x] Make each status card clickable — clicking sets statusFilter; clicking same card again resets to null
- [x] Total Items card resets statusFilter to null
- [x] Active status card shows a highlighted border/background to indicate selection
- [x] No other changes to the app

## Dynamic Status Card Counts
- [x] StatsBar receives party-filtered items so counts and percentages reflect the active party filter; when no filter is active it shows full totals

## Clear All Filters Button
- [x] Rename 'Clear ×' to 'Clear all filters', show it when either party or status filter is active, and reset both filters on click

## Filter Summary Banner
- [x] Show a compact summary banner at the top of the checklist when any filter is active, describing the current filter criteria (party, status, or both) and the number of matching items

## Rename Pending → Under Review
- [x] Update shared types (ItemStatus enum/type) in shared/ or client/src/types.ts
- [x] Update drizzle schema enum for item status
- [x] Update server routers.ts: zod validation, any string literals referencing "Pending"
- [x] Update ChecklistSection.tsx: status dropdown option label
- [x] Update StatsBar.tsx: card label "Pending" → "Under Review"
- [x] Update Sidebar.tsx: status legend entry
- [x] Update DealPage.tsx: filter summary banner and any hardcoded "Pending" strings
- [x] Update AI system prompt (ChatPanel or routers.ts) to use "Under Review" instead of "Pending"
- [x] Migrate existing DB rows: UPDATE checklist_items SET status = 'Under Review' WHERE status = 'Pending'
- [x] Update vitest tests that reference "Pending" status

## Remove Strikethrough from Executed Items
- [x] Remove line-through text decoration from checklist item titles with Executed status in ChecklistSection.tsx

## Governing Law Dropdown in New Deal Form
- [x] Replace Governing law free-text input in NewDealModal Step 1 with a Select dropdown (English law, Scots law, Irish law, New York law, Delaware law, German law, French law, Dutch law, Luxembourg law, Singapore law, Hong Kong law, UAE law, Other); when Other is selected show a free-text input below

## Searchable Governing Law Dropdown
- [x] Replace the Governing Law Select in NewDealModal with a searchable Combobox (Popover + Command pattern) so users can type to filter the list

## CR Monogram Logo Update
- [x] Create CR split-colour SVG logo (dark imperial blue left half with white C, white right half with black R, rounded square, clean vertical divider)
- [x] Generate favicon (32x32 and 16x16 ICO/PNG) from the SVG
- [x] Upload SVG and favicon as static assets
- [x] Update all logo instances in the app (Sidebar, Home header, any other locations) to use the new SVG
- [x] Update favicon in client/index.html

## Status Change Timestamps & AI Prioritisation
- [x] Add statusChangedAt (bigint UTC ms) column to checklist_items in drizzle/schema.ts
- [x] Generate migration SQL and apply it via database
- [x] Set statusChangedAt = now() on item creation in server/db.ts and routers.ts
- [x] Set statusChangedAt = now() whenever status is updated via items.updateStatus
- [x] Return statusChangedAt in all item query helpers (getItems, getDealItems, etc.)
- [x] Display "Status updated: DD Mon YYYY, h:mma" below item name in ChecklistSection in small grey text
- [x] Timestamp updates optimistically in the UI when status dropdown is changed
- [x] Upgrade AI assistant system prompt to rank outstanding/under-review items by: (1) section priority (CP > TD > PC), (2) days in current status, (3) days to closing; name responsible party for each item

## Natural Language Status Update via AI
- [x] Add a two-step LLM call in the AI chat procedure: (1) intent detection with structured JSON output to identify item, new status, and confidence; (2) main chat response that incorporates the action taken
- [x] Handle ambiguity: if multiple items match, return a clarification question without making any changes
- [x] Handle unrecognised item: if no item matches, respond clearly and offer to add it
- [x] Handle status revert: AI can set any item back to any valid status
- [x] Add items.updateStatusByAI tRPC procedure that updates status + statusChangedAt and returns downstream impact stats
- [x] Wire the AI response to call updateStatusByAI when intent is confirmed (single unambiguous match)
- [x] Update ChatPanel to invalidate the checklist query after a successful AI status change so the UI refreshes in real time
- [x] Downstream impact: AI response includes remaining CP count, TD completion status, and overall progress percentage
- [x] Status timestamp updates automatically when AI makes a change (same as manual status change)

## AI Assistant Tone & Optimistic Checklist Updates
- [x] Update AI system prompt: no apologies unless genuine error; confident professional tone; act immediately on status updates; communicate like a senior Magic Circle associate
- [x] Optimistic checklist update: when AI confirms a status change, update the item status in the local React query cache immediately (before the server round-trip completes) and reconcile with the actual DB state in the background

## Regenerate AI Response
- [x] Add a "Regenerate" button (refresh icon + label) that appears below the last AI message in the chat
- [x] Clicking Regenerate removes the last AI reply from local state, re-sends the last user message to chat.send, and replaces the old reply with the new one
- [x] Button is hidden while a response is loading (isPending) and hidden when there are no messages or the last message is from the user
- [x] If the previous AI response triggered a status update, regenerating re-runs the full intent detection + status update flow (server writes statusChangedAt and an audit entry on each call; re-confirming the same status is harmless)
- [x] No changes to the server — regenerate reuses the existing chat.send procedure

## Fix AI Prioritisation — Exhaustive CP Listing
- [x] Update actionContext in routers.ts: after a status update, inject the full list of every outstanding and under-review CP item (name + assigned party) into the prompt, not just a count; instruct the AI to list ALL of them before moving to Transaction Documents and Post-Closing items
- [x] Update the system prompt prioritisation rules to explicitly state that ALL outstanding/under-review CPs must be named — stopping at the first is a critical error

## Explicit Section-Clear Confirmations
- [x] Update actionContext in routers.ts: compute pcBlockers (post-closing outstanding/under-review items) and inject explicit "section clear" text for CPs, TDs, and Post-Closing when each has zero remaining items, so the AI never silently omits a section
- [x] Add a system prompt rule: when reporting on deal status, the AI must explicitly confirm every section that is fully clear — silence is never acceptable as confirmation in a legal closing context

## Fix AI Section Item Count Accuracy
- [x] Derive section heading counts directly from the blocker list length (cpBlockers.length, tdBlockers.length, pcBlockers.length) so the count injected into the prompt is always identical to the number of items in the list — no separate filter that could diverge
- [x] Add a prompt instruction: the count in each section heading must equal the exact number of items listed below it; never state a count that differs from the list

## Post-Closing Statutory Deadline Awareness
- [x] Remove the blanket "Post-Closing items can wait until after closing" rule from the prioritisation section of the system prompt and replace it with a nuanced rule that distinguishes time-sensitive post-closing items (those with statutory/regulatory deadlines) from genuinely deferrable ones
- [x] Add a statutory deadline reference table to the system prompt covering common UK post-closing obligations (stamp duty, Companies House filings, land registration, etc.) with their deadlines and penalty consequences, so the AI can flag them accurately
- [x] Update the actionContext post-closing section to instruct the AI to flag any item that matches a known statutory deadline as time-sensitive rather than low urgency

## Post-Closing AI Behaviour — Informational Reframe & PSC Fix
- [x] Rewrite the POST-CLOSING URGENCY RULES block in the system prompt: remove all action instructions, urgency labels (HIGH URGENCY, DEFERRABLE, TIME-SENSITIVE, etc.), and advisory language; replace with a purely informational format that states only the statutory deadline and consequence of non-compliance, letting the lawyer draw their own conclusions
- [x] Add "share transfer, transfer of shares" as a keyword row in the statutory deadline table, linked to the PSC register 14-day obligation under CA 2006 s.790M, so Companies House share transfer items are no longer categorised as deferrable

## Post-Closing No-Deadline Fallback Wording
- [x] Change the fallback phrase for post-closing items with no matching statutory deadline from "no statutory deadline identified in this reference" to "No statutory deadline applies to this item"

## AI Response Style — Neutral Headings & Status Separation
- [x] Remove "critical blockers" from CP section headings and "required at closing" / "urgent" from TD section headings in both the actionContext and system prompt; replace with neutral factual format: "Conditions Precedent — N Under Review, N Outstanding" and "Transaction Documents — N Under Review, N Outstanding"
- [x] Update actionContext and system prompt to require that within each section the AI groups items by status — all Under Review items listed first under a subheading, then all Outstanding items under a separate subheading — and never groups the two statuses together in a single list

## AI Response Style — Remove Advisory Phrases & Split-Count Headings
- [x] Remove all remaining advisory phrases from the system prompt: "must be satisfied before closing", "are required at closing", "must be satisfied before closing", "are still outstanding or under review and must be satisfied before closing", and any similar language; replace with neutral factual alternatives such as "The following Conditions Precedent remain" and "The following Transaction Documents remain"
- [x] Update the system prompt instructions for general status queries (not just actionContext) to enforce split-count headings: "CONDITIONS PRECEDENT — N Under Review, N Outstanding" rather than "CONDITIONS PRECEDENT (N items remaining)"

## Party-Specific Outstanding Items Summary
- [x] Add "party_summary" to the intent detection schema in routers.ts so the LLM can return intent="party_summary" with a partyName field when the lawyer asks about a specific party's outstanding items
- [x] Compute a party-specific item list server-side: filter all checklist items by responsible party (buyer, seller, buyerCounsel, sellerCounsel, or other) matching the detected partyName, group by section and status (Under Review first, then Outstanding), and inject the pre-computed list into actionContext
- [x] Add a system prompt rule for party_summary responses: the AI must report all three sections (CPs, TDs, Post-Closing) for the named party, using the split-count heading format, and explicitly confirm if a section has no items assigned to that party
- [x] Add Vitest tests covering party_summary intent detection and the party filter logic

## Natural Language Item-Status Query
- [x] Add "item_status_query" to the intent detection schema with a matchedItemIds field so the LLM can return intent="item_status_query" when the lawyer asks about the status of a specific named item
- [x] When item_status_query is detected, inject a structured ITEM STATUS block into actionContext containing the matched item's current status, section, responsible party, days in current status, notes, and deadline
- [x] If multiple items could match (ambiguous), fall through to clarification_needed; if no item matches, fall through to not_found
- [x] Add Vitest tests covering the item_status_query happy path and the no-match fallback

## Status-Filter Query (Show All Items With a Given Status)
- [x] Add "status_filter_query" to the intent detection schema with a filterStatus field so the LLM returns intent="status_filter_query" and filterStatus="Under Review"|"Outstanding"|"Executed"|"Waived" when the lawyer asks to see all items with a specific status
- [x] When status_filter_query is detected, inject a structured STATUS FILTER QUERY block into actionContext: filter all checklist items by the requested status, group by section (CPs, TDs, Post-Closing), and include item name, responsible party, and days in status for each item
- [x] If no items match the requested status, inject an explicit "no items with this status" message so the AI confirms the section is clear rather than silently omitting it
- [x] Add Vitest tests covering the status_filter_query happy path and the empty-result case

## Portfolio Dashboard Home Page Redesign
- [x] Extend the deals.list tRPC procedure to return all fields needed by the dashboard: deal structure, buyer name, seller name, deal value, closing date, and per-deal item status counts (Executed, Under Review, Outstanding, Waived) including a breakdown of CP-specific statuses for health indicator logic
- [x] Build summary row at the top of Home.tsx: total active deals, total executed items across all deals, total outstanding items across all deals, total under review items across all deals
- [x] Build deal card component with: deal name, deal structure, buyer name, seller name, deal value, target closing date, days remaining until closing, overall progress bar (% complete), status breakdown (Executed / Under Review / Outstanding / Waived counts)
- [x] Add health indicator (coloured dot/banner) to each deal card: green = all CPs resolved and on track; amber = any CP under review OR closing within 30 days with outstanding items; red = any CP outstanding OR closing within 14 days with outstanding items
- [x] Make each deal card clickable — navigates to /deals/:id
- [x] Add prominent New Deal button on the dashboard that opens the two-step new deal setup form (same modal as before)
- [x] Ensure the design is clean and minimal, consistent with the existing ClosingRoom interface (same typography, colours, spacing)
- [x] Do not change the deal checklist page or any other page

## Portfolio Dashboard — Search & Filter Bar
- [x] Add a search input to the dashboard that filters deal cards in real time by deal name, buyer name, or seller name (case-insensitive substring match)
- [x] Show a "No deals match your search" empty state when the query returns zero results, with a clear/reset option
- [x] Update the summary row counts to reflect only the filtered deals when a search is active
- [x] Keep the search bar visually consistent with the rest of the ClosingRoom interface (same input style, border, focus ring)

## Duration-Aware AI Queries
- [x] Add "item_duration_query" intent: fires when a lawyer asks how long a specific named item has been in its current status; inject the item's current status, statusChangedAt date, and computed days-in-status into actionContext; AI must respond with exact duration in days and the date the status was last changed
- [x] Add "duration_threshold_query" intent: fires when a lawyer asks which items have been in a given status for more than N days; inject a filtered, section-grouped list of all items exceeding the threshold (with status, days-in-status, and statusChangedAt date for each); AI must list every matching item with both the duration and the exact date
- [x] Add Vitest tests covering both new intents (4 tests added, total now 32)

## Deal Narrative Introduction & Chaser Email Draft
- [x] Inject full deal metadata (name, structure, targetCompany, buyerName, sellerName, dealValue, governingLaw, closingDate, daysToClose, overallProgress%) into the system context for every chat.send call so the AI always has access to it
- [x] Add a DEAL NARRATIVE INTRODUCTION rule to the system prompt: when the intent is a full status update or deal summary, the AI must begin with a brief factual introductory paragraph stating all deal metadata fields before the checklist breakdown
- [x] Add "email_draft" to the intent detection schema with a partyName field; fires when the lawyer asks to draft a chaser email to a specific named party
- [x] When email_draft is detected, inject an EMAIL DRAFT block into actionContext: deal name, closing date, days remaining, and a section-grouped list of all outstanding and under-review items assigned to that party (name, status, days in status); instruct the AI to draft a professional legal email with subject line, introduction referencing closing date, itemised list, and professional closing requesting an update by return
- [x] Add a system prompt rule for email_draft: email must be in Magic Circle law firm tone, must not be sent automatically, must be clearly labelled as a draft for the lawyer to review
- [x] Add Vitest tests covering the email_draft intent (3 tests added, total now 35)

## Email Draft — Selective Item Inclusion
- [x] Extend the email_draft intent schema: add an emailItemTitles field (string[] | null) that the LLM populates when the lawyer names specific items in their request (e.g. "draft a chaser to Slaughter and May about the SPA and the board approval"); when null, include all outstanding/under-review items for that party as before
- [x] Update the actionContext EMAIL DRAFT REQUEST block: when emailItemTitles is non-null, filter the item list to only those items whose titles fuzzy-match the specified names; inject the filtered list instead of the full party list; if a specified item cannot be matched, note it clearly so the AI can flag it in the response
- [x] Update the system prompt email_draft rule to instruct the AI that when specific items are requested it must include only those items, and when none are specified it must include all outstanding/under-review items for the party
- [x] Update Vitest tests to cover the selective item inclusion path (2 new tests added, total now 37)

## Quick Action Buttons in AI Panel
- [x] Add four quick action buttons above the text input in ChatPanel.tsx: 'Full status update', 'What should I prioritise?', 'Draft chaser email', 'Party summary'
- [x] Each button sends a pre-set message to the AI on click (same as typing and submitting): 'Full status update' → "Give me a full status update on this deal", 'What should I prioritise?' → "What should I prioritise?", 'Draft chaser email' → "I'd like to draft a chaser email — which party would you like to chase?", 'Party summary' → "I'd like a party summary — which party would you like a summary for?"
- [x] For 'Draft chaser email' and 'Party summary', the pre-set message should prompt the AI to ask which party the lawyer means (since it cannot know in advance)
- [x] Buttons must be disabled while a response is loading (isPending)
- [x] Style: small, clean pill/outline buttons consistent with the ClosingRoom interface; sit in a scrollable row above the input field and below the chat thread
- [x] Do not remove or change any existing preset question buttons; add new ones alongside or replace exact duplicates

## Export Checklist as PDF
- [x] Install pdfkit (or use PDFDocument from pdfkit) as the server-side PDF generation library
- [x] Add a GET /api/deals/:dealId/export-pdf Express route (outside tRPC) that fetches the full deal + items from the DB, generates a formatted PDF, and streams it as application/pdf with Content-Disposition: attachment
- [x] PDF format: deal name/structure/parties/value/closing date header, then three sections (Conditions Precedent, Transaction Documents, Post-Closing) each with a table of item name, status, responsible party, and days in status; include a footer with export timestamp
- [x] Add an "Export PDF" quick action button to ChatPanel.tsx that triggers a browser download (window.open or fetch + blob) rather than sending a chat message
- [x] Button shows a loading spinner while the PDF is being generated and resets on completion or error

## PDF Export Bug Fixes
- [x] Fix section header formatting: TRANSACTION DOCUMENTS and POST-CLOSING must render on a single line without word breaks
- [x] Fix Party column: show the real assigned party name (buyer name, seller name, counsel name, All Parties, or custom Other name) instead of the raw DB enum value 'all'
- [x] Fix IN STATUS duration: ensure days-in-status is calculated correctly for all items (some show 0 days incorrectly)
- [x] Add CR logo to top-left of PDF header (split-colour rounded square, dark imperial blue left half with white C, white right half with black R)

## PDF Export — Summary Page
- [x] Add a summary page as page 1 of the PDF, before the checklist sections, containing: deal header (logo, name, structure, parties, value, closing date, governing law), overall progress bar, status breakdown stat cards (Executed / Under Review / Outstanding / Waived with counts and percentages), per-section breakdown table (CP / TD / Post-Closing rows with Executed / Under Review / Outstanding / Waived counts), days-to-closing countdown, and export timestamp

## PDF Export — Formatting Fixes
- [x] Fix vertical text: 'DAYS TO CLOSING' and 'Checklist Breakdown by Section' labels must render horizontally
- [x] Fix All Parties party column: show only 'All Parties', not every individual party name
- [x] Fix section breakdown table: all rows and columns must stay on one page without splitting
- [x] Fix page layout: remove blank pages and excessive gaps; content flows continuously; new page only when content genuinely does not fit
- [x] Fix footer: export timestamp and page number appear consistently at the bottom of every page in the same position and format

## PDF Export — Critical Bug Fixes (Round 2)
- [x] Fix party column: resolvePartyLabel must show the actual assigned party for each item; 'All Parties' must only appear when that specific item was genuinely assigned to All Parties
- [x] Fix blank pages: footer (timestamp + page number) must appear at the bottom of content pages only — no separate blank pages

## PDF Export — Formatting Fixes (Round 3)
- [x] Fix party column width: increase width so names like 'BlackStone Ridge Capital LLP' display on a single line without wrapping
- [x] Fix column header word-breaking: 'UNDER REVIEW' and 'OUTSTANDING' must not break mid-word; increase column width or reduce font size
- [x] Ensure all text is horizontal, not rotated/wrapped mid-word/truncated; reduce font size if content does not fit
- [x] Fix footer: timestamp and page number must appear in the footer of every content page, not on separate blank pages at the end

## AI Assistant Rename
- [x] Rename AI assistant to 'Clark' everywhere: panel header, subtitle, quick action buttons, input placeholder, system messages, and self-introduction in server-side prompt

## Smart Dropdown for Party Assignment
- [x] Implement smart/flip dropdown for party assignment: detect available space and open upward when insufficient space below; apply to all party dropdowns in Conditions Precedent, Transaction Documents, and Post-Closing sections

## Smart Dropdown for Status Update
- [x] Apply smart dropdown logic to status update dropdown: detect available space and open upward when insufficient space below

## Smart Positioning for Tooltips
- [x] Implement smart positioning for all tooltips: detect available space and position tooltips to avoid viewport cutoff; apply to all tooltip instances across the app

## Chat Panel Auto-Scroll
- [x] Implement auto-scroll in ChatPanel: scroll to bottom automatically when Clark responds, both during real-time generation and after response completes; smooth scrolling behavior

## Clark Conversation Memory
- [x] Enable Clark to remember conversation context: pass the full message history (all prior user and assistant turns) to the LLM on every chat.send request so follow-up questions work without repeating information

## Clark Full Checklist Access
- [x] Expand the checklist data passed to Clark so it includes all fields for every item across all three sections: item ID, section, title, status, responsible party, notes, days in current status, and order index — enabling Clark to reference any item accurately in its responses

## Clark Panel Layout Redesign
- [x] Convert Clark panel from a fixed side panel to a floating overlay/modal so it does not compress the checklist when open
- [x] Make the Clark panel tall enough that responses are readable with minimal scrolling; only the conversation thread scrolls, quick action buttons remain fixed at the bottom
- [x] Ensure the checklist always has full width regardless of whether Clark is open or closed

## Clark Copy Latest Response
- [x] Add a copy-to-clipboard button to the Clark panel quick actions bar that copies the latest assistant response text to the clipboard; show a brief confirmation (checkmark or "Copied") after clicking; button is disabled when there is no assistant response or Clark is generating

## Remove Signatures Tab
- [x] Remove the Signatures tab from the right panel: remove it from PANEL_TABS, remove its content renderer, remove the SignaturesPanel import, and remove the Signature icon import if unused

## Remove CP Waiver Tracker
- [x] Remove the CP waiver tracker feature entirely: remove Waivers tab from right panel, remove WaiversPanel component references, remove any waiver tracker navigation in Sidebar, remove any dedicated waiver routes/pages, remove waiver-related tRPC procedures from routers.ts and db.ts if they exist exclusively for the waiver tracker (not for the Waived status on items); keep the Waived status on individual checklist items

## Rename Deal Members → Deal Team
- [x] Rename 'Deal Members' to 'Deal Team' everywhere: panel header, tab label, navigation items, buttons, and placeholder text; no functionality changes

## Clark Bulk Update Safeguard
- [x] Add safeguard to Clark: detect and decline bulk status update requests for all items (e.g. 'mark all items as executed'); respond with explanation that each item must be confirmed individually; ask user to specify which individual items to update

## Clark PDF Document Analysis
- [x] On PDF upload to a checklist item: extract text from the PDF using the LLM file_url capability and store the extracted text in the documents table (add an extractedText column); send a neutral confirmation message to the chat ("Document received. Ask me anything about it.")
- [x] In Clark's chat.send procedure: include extracted text from documents attached to the current deal's checklist items in the system prompt context so Clark can answer questions about them
- [x] Clark should only make factual observations (dates, party names, clearance/consent present); never make legal judgments; always remind lawyer to review before updating status
- [x] When Clark identifies a document evidences completion of a checklist item, ask the lawyer whether they want to mark it as Executed (do not do it automatically)

## Clark Document Summary on Request
- [x] Add "document_summary" to the intent detection schema with a documentFilename field (string | null) so the LLM returns intent="document_summary" when the lawyer asks for a summary or overview of an uploaded document
- [x] When document_summary is detected, inject a DOCUMENT SUMMARY REQUEST block into actionContext: include the matched document's filename and full extracted text; if documentFilename is null or no match is found, list all uploaded documents so the lawyer can specify which one
- [x] Add a system prompt rule for document_summary responses: Clark must provide a concise factual overview (parties, key dates, subject matter, any clearances or consents present); no legal judgments; always remind the lawyer to review the document themselves
- [x] Add Vitest tests covering the document_summary happy path (specific document named), the no-document-named fallback (lists all documents), and the no-documents-uploaded case

## Clark Document Follow-Up Questions
- [x] Add "document_question" to the intent detection schema with a documentFilename field (string | null) so the LLM returns intent="document_question" when the lawyer asks a follow-up question about an uploaded document (e.g. "Who are the parties?", "What date was it signed?", "Does it confirm clearance?", "What conditions are attached?")
- [x] When document_question is detected, inject a DOCUMENT QUESTION block into actionContext: include the matched document's filename and full extracted text so Clark can answer the specific question; if documentFilename is null but only one document exists, use that document; if multiple documents exist and none is specified, ask for clarification
- [x] Add a system prompt rule for document_question responses: answer the specific question factually using only the document content; never make legal judgments; always end with the review reminder
- [x] Add Vitest tests covering: specific question about a named document, follow-up question with only one document uploaded (no filename needed), and question when no documents are uploaded

## Clark Defined Terms Extraction
- [x] Add "document_defined_terms" to the intent detection schema with a documentFilename field (string | null) so the LLM returns intent="document_defined_terms" when the lawyer asks Clark to extract, list, or identify defined terms from an uploaded document (e.g. "Extract all defined terms", "List the definitions in this document", "What terms are defined in the SPA?", "Show me the definitions", "What is defined in this document?", "Pull out all the defined terms", "Give me the glossary")
- [x] When document_defined_terms is detected, inject a DOCUMENT DEFINED TERMS REQUEST block into actionContext with the matched document's full extracted text; handle the same three scenarios as document_question (named doc, single doc auto-select, multiple docs ask for clarification, no docs)
- [x] Add a DOCUMENT DEFINED TERMS RULE to the system prompt: extract every term that is explicitly defined in the document (capitalised terms with definitions, terms defined in a definitions section, or terms defined inline with "means", "refers to", "shall mean", etc.); present them as a structured list with each term and its definition; never infer definitions not present in the document; end with the review reminder
- [x] Add Vitest tests covering: happy path (document with defined terms), no documents uploaded case

## Clark Party Obligations, Rights and Responsibilities
- [x] Add "document_party_obligations" to the intent detection schema with a documentFilename field (string | null) and a partyName field (string | null) so the LLM returns intent="document_party_obligations" when the lawyer asks Clark to identify obligations, rights, or responsibilities of parties in an uploaded document (e.g. "What are the obligations of each party?", "What does the Buyer have to do?", "List the Seller's responsibilities", "What rights does the Target have?", "Show me each party's obligations", "What are the parties' obligations under this agreement?", "What is the Buyer responsible for?")
- [x] When document_party_obligations is detected, inject a DOCUMENT PARTY OBLIGATIONS REQUEST block into actionContext with the matched document's full extracted text; handle the same four scenarios as other document intents (named doc, single doc auto-select, multiple docs ask for clarification, no docs); if partyName is specified, focus on that party only
- [x] Add a DOCUMENT PARTY OBLIGATIONS RULE to the system prompt: identify every obligation (must/shall/will), right (may/is entitled to/has the right to), and responsibility (is responsible for/shall procure/shall ensure) for each named party; present as a structured breakdown grouped by party with three sub-sections (Obligations, Rights, Responsibilities); quote or closely paraphrase the document; never make legal judgments; end with the review reminder
- [x] Add Vitest tests covering: happy path (all parties), single party focus, no documents uploaded

## Clark Party Comparison
- [x] Add "party_comparison" to the intent detection schema with a partyNames field (string[]) so the LLM returns intent="party_comparison" when the lawyer asks to compare the outstanding obligations of two or more parties (e.g. "Compare what Allen & Overy and Slaughter and May still owe", "Show me a comparison of Buyer Counsel and Seller Counsel's outstanding items", "What does each party still have to do?", "Compare the outstanding items for Party A and Party B")
- [x] When party_comparison is detected, inject a PARTY COMPARISON REQUEST block into actionContext: for each named party, collect all checklist items with status "Outstanding" or "Under Review" assigned to that party, grouped by section (Conditions Precedent, Transaction Documents, Post-Closing); include item title, status, and section for each item; include a summary count per party (total outstanding, total under review)
- [x] Add a PARTY COMPARISON RULE to the system prompt: present a structured side-by-side comparison with a summary count table at the top (party name, outstanding count, under review count, total), then a section-by-section breakdown for each party; use clear headings; if a party has no items in a section, state that explicitly; never make legal judgments; end with the review reminder
- [x] Add Vitest tests covering: happy path (two parties with items across sections), one party has no outstanding items, party name not found in checklist data

## Document Attachment Indicator on Checklist Items
- [x] Add a tRPC query (documents.getByDeal) or extend the existing checklist items query to include a hasDocument flag and document URL per item, so the frontend knows which items have an attached PDF
- [x] In the checklist item row component, render a subtle paperclip or document icon next to the item name when hasDocument is true; the icon must be visually subtle (muted colour, small size) and must not appear when no document is attached
- [x] Clicking the icon should open a document preview — use a modal/dialog with an iframe or object tag rendering the PDF via the storage URL (storageGetSignedUrl); the modal should show the document filename as its title and have a close button
- [x] No changes to items with no document attached

## Deal Card Updates (Portfolio Dashboard)
- [x] Add Buyer's Counsel and Seller's Counsel row to the deal card, displayed below the Buyer/Seller row in the same format, pulled from the deal setup fields (buyerCounsel, sellerCounsel)
- [x] Add a Last Updated indicator to the deal card showing when the checklist was last updated (e.g. "Last updated: 2 hours ago" or "Last updated: 26 Apr 2026"); update automatically whenever any checklist item status changes
- [x] Fix the Waived status indicator on the deal card to be consistent in colour and font weight with the Executed, Under Review, and Outstanding indicators

## Portfolio Dashboard Header Simplification
- [x] Remove the Executed, Under Review, and Outstanding summary count cards from the portfolio dashboard header row; keep only the Active Deals count card

## Prominent Portfolio Search Bar
- [x] Replace the small right-aligned search input in the page title row with a full-width prominent search bar positioned between the page title and the Active Deals card; the bar should be visually distinct (larger height, border, icon, placeholder text "Search deals by name…"), auto-focused on page load, and retain the existing filter logic

## Portfolio Dashboard Sort Dropdown
- [x] Add a sort dropdown next to the search bar with options "Last Updated" (default, most recent first) and "Deal Name" (A–Z); apply the selected sort to the filtered deal list

## Deal Unread Indicator
- [x] Add a lastViewedAt column (nullable timestamp) to the deals table; a deal is unread if lastItemUpdatedAt > lastViewedAt or lastViewedAt is null
- [x] Add a deals.markAsViewed tRPC mutation that sets lastViewedAt to the current timestamp for a specific deal
- [x] On the deal card: show a small blue dot or badge in the top-right corner when the deal is unread; hide it when read
- [x] Automatically call markAsViewed when a user navigates to a deal page

## Link Documents to Checklist Items
- [x] Add a tRPC mutation `documents.linkToItem` that sets `checklistItemId` on an existing document
- [x] In the Documents panel, add a "Link to item" button on each document card that opens a dropdown/select of all checklist items for the deal
- [x] After linking, the document's `checklistItemId` is updated in the DB and the paperclip icon appears on the linked item row
- [x] Documents uploaded directly on an item row already set `checklistItemId` correctly — no change needed there

## Disable Automatic Checklist Extraction on Upload
- [x] Remove automatic AI extraction call from the confirmUpload tRPC mutation (server-side) — N/A: confirmUpload never called extractAndPopulate automatically
- [x] Remove any automatic extraction call from the DocumentsPanel upload handler (client-side) — confirmed not present
- [x] Remove the manual "Extract checklist items" sparkle button from the Documents panel entirely (per user request to never add checklist items without explicit lawyer action)

## Linked Document Display on Checklist Item Rows
- [x] Pass docsByItem map from ChecklistSection down to ItemRow so each row knows its linked document
- [x] In ItemRow, render a document attachment strip below the item title/party row when a document is linked (checklistItemId matches item.id)
- [x] Attachment strip shows: file icon, filename (truncated), download button (opens storageKey URL), and remove/unlink button
- [x] Remove button calls documents.linkToItem with checklistItemId: null to unlink, then invalidates documents.list
- [x] Download button fetches the presigned URL via documents.getUrl and opens it in a new tab
- [x] If no document is linked, nothing is rendered
- [x] Works across all three sections: Conditions Precedent, Transaction Documents, Post-Closing

## Complete Removal of Auto Checklist Extraction (Audit)
- [x] Remove the `extractAndPopulate` tRPC procedure entirely from server/routers.ts (this is the only server-side path that calls createChecklistItem from a document)
- [x] `createChecklistItem` import kept — still used by the manual add-item procedure at line 196 (legitimate, lawyer-initiated)
- [x] Confirmed no client code references `extractAndPopulate` anywhere
- [x] Confirmed `confirmUpload` does NOT call createChecklistItem — it only stores the file and extracts text for Clark Q&A

## Multi-Threaded Conversations for Clark AI
- [x] Add `conversationThreads` table to schema with: id, dealId, userId, title (nullable), createdAt, updatedAt
- [x] Add `conversationMessages` table to schema with: id, threadId, role (user/assistant), content, createdAt
- [x] Generate and apply database migration for new tables
- [x] Add tRPC procedures: threads.list, threads.create, threads.update (title), threads.delete, messages.list, messages.add
- [x] Update Clark panel UI: add conversation sidebar showing all threads for current deal
- [x] Add "New Conversation" button at top of Clark panel
- [x] Implement thread switching: clicking a thread loads its messages and sets it as active
- [x] Add editable thread titles (click to edit, save on blur)
- [x] Add delete button on each thread with confirmation prompt
- [x] Migrate existing chat messages to a default thread for the deal (one-time migration)
- [x] Ensure thread management never affects checklist data

## Clark Panel Layout Fix
- [x] Redesign ConversationThreadsPanel: conversation content takes full width by default
- [x] Add a history icon/button at the top of the panel that toggles a collapsible sidebar
- [x] Sidebar slides in/out over the content when the history button is clicked
- [x] New Conversation button remains always visible at the top of the panel
- [x] When sidebar is closed, full panel width is used for conversation content

## Clark Panel Viewport Fix
- [x] Constrain Clark panel height to fit within visible viewport (no zoom required)
- [x] Make the message area scrollable so it never pushes the input field off screen
- [x] Input field must always be visible at the bottom of the panel
- [x] Reposition panel to right side of screen so it does not cover checklist items

## Clark Checklist Context Bug (Critical) — FIXED
- [x] Root cause identified: threadsRouter.sendMessage was a stub returning hardcoded strings instead of calling invokeLLM with the full Clark system prompt
- [x] Replaced stub with the complete Clark system prompt identical to chatRouter.send — all intents handled: party_summary, party_comparison, email_draft, document_summary, document_question, status_change, item_status_query, etc.
- [x] Live checklist data (all items, statuses, assigned parties, timestamps) always injected into system prompt for every thread message
- [x] Clark will never respond with a generic introduction to a checklist-specific question

## Auto-Name Conversation Threads from First Message
- [x] In threadsRouter.sendMessage: after saving the user message, check if the thread has a title already set (non-null, non-empty)
- [x] If no title is set AND this is the first message in the thread: auto-set the title to the first 60 characters of the user's message (trimmed), truncated at the last word boundary with "..." if longer
- [x] Update the thread title in the database using updateConversationThread
- [x] In the threads.create procedure: title defaults to null so new threads show as "New Conversation" in the UI
- [x] In the ConversationThreadsPanel: display null/empty title as "New Conversation" placeholder text
- [x] After sendMessage, invalidate threads.list so the sidebar updates immediately with the auto-generated title

## Restore Quick Action Buttons in Clark Panel
- [x] Add 5 quick action buttons above the input field: "Full status update", "What should I prioritise?", "Draft chaser email", "Party summary", "Export PDF"
- [x] Clicking a button sends that text as a message to Clark (same as typing and submitting)
- [x] Buttons displayed as small, clean chips in a flex-wrap row
- [x] Buttons are shrink-0 and sit between the messages area and the input field
- [x] Panel height and width must not change — buttons must not push the input off screen

## Clark Panel Button Updates
- [x] Remove "Party summary" quick action button from Clark panel
- [x] Fix "Export PDF" button: now calls /api/deals/{dealId}/export-pdf directly and triggers browser download — does not send a message to Clark
- [x] Added dealName prop to ConversationThreadsPanel so the downloaded file is named correctly

## Clark Status Update Speed Improvement
- [x] Investigate current status update flow: intent detection → DB write → AI response → checklist refresh
- [x] Execute DB status write immediately after intent detection (before LLM generates full response)
- [x] Return structured action metadata (itemId, newStatus) in the sendMessage response so the client can update the cache immediately
- [x] Implement optimistic UI update in checklist: when sendMessage response contains a status_change action, update the tRPC cache immediately without waiting for a deals.get refetch
- [x] If DB write fails, revert the optimistic update and show an error toast (error toast already shown by sendMessageMutation.onError)

## Clark Panel Quick Action Button Removal
- [x] Remove 'Full status update' quick action button from Clark panel; keep 'What should I prioritise?', 'Draft chaser email', and 'Export PDF' unchanged

## Clark Prompt & Panel Cleanup
- [x] Remove all statutory deadline, legislation, consequences of non-compliance, and legal obligation language from both Clark system prompts (chatRouter.send and threadsRouter.sendMessage) in server/routers.ts
- [x] Fix item description format in Clark responses: each item must show only item name, status, duration, and responsible party — no section name within the item line
- [x] Remove 'What should I prioritise?' quick action button from Clark panel; keep only 'Draft chaser email' and 'Export PDF'

## Clark Panel — Remove Draft Chaser Email Button
- [x] Remove 'Draft chaser email' quick action button from Clark panel; only 'Export PDF' remains

## Clark Response Bug Fixes
- [x] Fix completion percentage calculation: must be (Executed + Waived) / total items — now injected authoritatively into both system prompts with CRITICAL RULE preventing Clark from recalculating
- [x] Fix missing checklist items: added OUTSTANDING ITEMS REFERENCE block to both system prompts with authoritative pre-computed list of all outstanding/under-review items per section; Clark instructed to reproduce verbatim
- [x] Fix duplicate word repetition (e.g. 'Outstanding Outstanding') — removed status from the fmt bracket in buildStatusGroupedList in both routers; group heading already conveys the status

## Clark Section Heading Duplicate Word Fix
- [x] Find and eliminate the root cause of duplicate status words in all Clark section headings (e.g. 'POST-CLOSING — 0 Under Review, 6 Outstanding Outstanding') — removed the count from sub-group labels in buildStatusGroupedList (both routers): 'Outstanding (N):' → 'Outstanding:' so the status word only appears once in the heading and never again in the item list block

## Clark POST-CLOSING Heading Duplicate Outstanding — Deep Fix
- [x] Exhaustively found two sources of 'Outstanding' in the POST-CLOSING heading: (1) the actionContext block (lines 502/1206) and (2) the OUTSTANDING ITEMS REFERENCE block (lines 859/1435). Removed cpHeadingCounts/tdHeadingCounts/pcHeadingCounts from the OUTSTANDING ITEMS REFERENCE block in both routers so heading counts only appear once (in actionContext). Heading now reads 'POST-CLOSING — 0 Under Review, 6 Outstanding' with no repetition.

## Clark Heading Duplicate — Final Root Cause Fix
- [x] Found root cause: buildStatusGroupedList was outputting 'Outstanding:\n- item...' sub-group labels. The heading already contained '0 Under Review, 6 Outstanding', so Clark saw Outstanding twice. Fixed by removing sub-group labels entirely from buildStatusGroupedList in both routers — items are now listed directly under the heading. Verified with simulation: Outstanding appears exactly 1 time in the block Clark sees.

## Clark 'Failed to send message' Error — Post-Prompt-Change Fix
- [x] Diagnosed 'Failed to send message' error: no code defects found. Server has zero TypeScript errors in routers.ts, all 56 tests pass, simulation confirms Outstanding appears exactly 1 time in POST-CLOSING block. Error was transient (likely during server restart after code change) or occurred on the deployed site before the latest checkpoint was published. Deployed site confirmed live at HTTP 200.

## Clark Deal Summary — Add Executed Items Per Section
- [x] Add executed item lists to Clark's deal summary context for all three sections (CP, TD, PC) in both chatRouter and threadsRouter system prompts — format: item name, Executed, duration, responsible party. Added fmtExecuted helper and cpExecutedList/tdExecutedList/pcExecutedList arrays. CHECKLIST ITEMS REFERENCE block now shows Outstanding/Under Review and Executed subsections per section. CRITICAL RULE updated to cover executed items.

## Remove Closing Memorandum Generator
- [x] Remove ClosingMemoPanel component, Generate Closing Memorandum button, panel nav icon, and all backend procedures/routes related to the Closing Memorandum Generator. Deleted MemoPanel.tsx, removed memo tab from DealPage.tsx (import, PanelTab type, PANEL_TABS entry, render), removed memoRouter block and memo: memoRouter from server/routers.ts. Still 16 pre-existing errors, all 56 tests pass.

## Clark Fix After Memo Removal
- [x] Diagnosed 'Failed to send message' error after memo removal: no code defect found. All routers (chat, threads) are intact in routers.ts. Server starts cleanly. Deployed site responds correctly (UNAUTHORIZED on unauthenticated request, not 500). Error was transient during the deployment window.
- [x] Executed items already implemented in both chatRouter and threadsRouter system prompts (checkpoint 7e7bca69, preserved through cbcac6e8): fmtExecuted helper, cpExecutedList/tdExecutedList/pcExecutedList arrays, CHECKLIST ITEMS REFERENCE block shows Executed subsection per section. All 56 tests pass.

## Clark Deal Summary — Three Bug Fixes
- [x] Fix All Parties responsible party: getPartyLabel now checks if any party in the JSON array is 'all parties' (case-insensitive) and returns 'All Parties' instead of joining all names
- [x] Fix duplicate Outstanding in POST-CLOSING heading: removed cpHeadingCounts/tdHeadingCounts/pcHeadingCounts from CHECKLIST ITEMS REFERENCE block in both routers; heading counts now only appear in actionContext block. Simulation confirms Outstanding appears exactly 2 times (once in heading, once in sub-label) — no duplication in Clark's output
- [x] Fix redundant labels in item descriptions: fmt and fmtExecuted now output '- Item [3d] — Party' (no quotes, no status word, no 'in status', no 'responsible:'). Applied to both chatRouter and threadsRouter via all:true edits

## Clark POST-CLOSING Formatting Fixes
- [x] Fix duplicate 'Outstanding' in POST-CLOSING heading — renamed 'Outstanding/Under Review:' sub-label to 'Items:' in CHECKLIST ITEMS REFERENCE block (both routers, all 3 sections). Simulation confirms Outstanding count = 1 in full prompt.
- [x] Add line break between Outstanding items group and Executed subheading — changed \nExecuted: to \n\nExecuted: in CHECKLIST ITEMS REFERENCE block (both routers, all 3 sections). Simulation confirms blank line present.

## Clark UI — Convert to Full-Screen Modal
- [x] Convert Clark from side panel to full-screen modal overlay with close button: removed drag logic and floating panel positioning, created full-screen modal with fixed inset-0 z-50 overlay, header with Clark title and 'Back to Checklist' button, full-width conversation thread
- [x] Preserve scroll position when closing Clark and returning to checklist: added checklistScrollRef and savedScrollPos, openClark saves scroll position before modal opens, closeClark restores position after modal closes

## Clark Bulk Update Prevention
- [x] Add rule to both Clark system prompts (chatRouter and threadsRouter) that prevents bulk status updates of all items in a single command. Clark must reject requests like 'mark all items as executed' or 'move everything to executed' and explain that each item must be updated individually for accuracy and accountability. Clark should then ask the lawyer to specify which individual items to update. Rule added to both routers with comprehensive examples and mandatory response format. All 56 tests pass.

## Party Filter Row Restoration
- [x] Restored the "Filter by party" pill-button row in DealPage.tsx below the status cards and above the checklist sections. Shows 'All' pill plus one pill per unique party name from checklist items. Clicking a party pill filters the checklist to show only items assigned to that party. Clicking 'All' shows all items. Works alongside status card filters. Also restored the filter summary banner that appears below the party filter row when any filter is active. All 56 tests pass.

## Filter Fixes
- [x] Status cards (Executed, Under Review, Outstanding, Waived, Total Items) must always show full deal totals regardless of active filters — pass all items (not partyFilteredItems) to StatsBar
- [x] Party filter and status card filter must work correctly independently and together — clicking a party pill filters by party only, clicking a status card filters by status only, both active shows items matching both, Clear all filters restores full view

## Bug Fix — Home Page Sort TypeError
- [x] Fixed TypeError: (x.lastItemUpdatedAt ?? x.deal.createdAt)?.getTime is not a function — sort comparator in Home.tsx now wraps values in new Date() before calling getTime, handling both string and Date types returned from the API

## Bug Fix — Party Filter Not Working
- [x] Fixed party filter on deal checklist page — getItemParties now checks the old party field as a fallback for backward compatibility. Items created with the old party enum (buyer_counsel, seller_counsel, bank, all) now show up in the party filter pills and can be filtered correctly.

## Bug Fix — Party Filter Not Filtering Items
- [x] Fixed party filter on deal checklist page — getItemParties now excludes "all" and "other" enum values from the party field fallback. Items with party="all" or party="other" no longer create empty filter pills. Only items with specific party labels (partyLabel, partyCustom, or partiesJson) now show up in the filter pills and can be filtered.

## Bug Fix — Party Assignment Dropdown Missing Deal Parties
- [x] Fix party assignment dropdown on checklist items to show all named deal parties (buyerName, sellerName, buyerCounsel, sellerCounsel) instead of only "All Parties" and "Other"

## Remove Deal Team Feature
- [x] Remove MembersPanel component file
- [x] Remove "members" tab from DealPage PANEL_TABS and PanelTab type
- [x] Remove MembersPanel import and render from DealPage.tsx
- [x] Remove membersRouter from server/routers.ts

## Bug Fix — "Failed to load deal" flash on navigation
- [x] Fixed: error screen was showing briefly on every deal page load because `!deal` was true while the query was still in flight. Added an explicit `isLoading` spinner guard before the error guard so the error screen only appears after loading completes and data is genuinely missing.

## Bug Fix — Document Download Access Denied
- [x] Fix document download to use /manus-storage/ proxy path instead of raw S3 URL
- [x] Fix document download — re-uploaded missing files to S3 and simplified download handler to use window.open with proxy URL
- [x] Fix document download — server-side streaming proxy (fetches from CloudFront server-side, streams bytes to browser, no redirect)

## Document Download Fix
- [x] Root cause: storagePut() appends a random hash suffix to the storage key, but confirmUpload was ignoring the returned key and storing the original key in the DB — so the file was stored under a different key than what was recorded, causing 403 "File not found" on download
- [x] Fix: capture the actual stored key returned by storagePut and update the DB record via updateDocumentStorageKey
- [x] Added updateDocumentStorageKey helper to db.ts
- [x] Updated confirmUpload in routers.ts to use the actual stored key
- [x] Added updateDocumentStorageKey mock to closingroom.test.ts
- [x] All 56 tests pass

## Deal Team / Members Panel (Multi-User Access)
- [x] Add `deal_members` table: id, dealId, userId (nullable for pending invites), email, name, role (admin|editor|viewer), inviteToken, inviteStatus (pending|accepted), invitedByUserId, lastAccessedAt, createdAt
- [x] Apply migration SQL
- [x] tRPC members.invite: create pending member record, generate invite token, return invite link
- [x] tRPC members.list: list all members for a deal (accepted + pending) with ownerId
- [x] tRPC members.remove: remove a member from a deal (admin only)
- [x] tRPC members.updateRole: change a member's role (admin only)
- [x] tRPC members.acceptInvite: accept an invite via token, link to Manus user
- [x] tRPC members.getInvite: public lookup of invite by token
- [x] tRPC members.myRole: get current user's role for a deal
- [x] Role-based access control: enforce Admin/Editor/Viewer on all deal procedures (server-side)
- [x] Track lastAccessedAt: update when user loads a deal via members.list
- [x] MembersPanel UI: member list with name, email, role, last accessed, remove button
- [x] MembersPanel UI: invite form with email input and role selector
- [x] MembersPanel UI: pending invite rows with copy-link and cancel button
- [x] MembersPanel UI: owner row shown as synthetic entry (cannot be removed)
- [x] Wire MembersPanel into DealPage right panel (restored the members tab)
- [x] Role-aware UI: hide edit/add/delete controls for Viewer and Editor roles in ChecklistSection
- [x] InviteAccept page: /invite/:token — auto-accepts when logged in, shows login prompt when not
- [x] OAuth returnPath support: after login, user is redirected back to /invite/:token
- [x] All 56 tests pass

## Delete Individual Conversations (Clark AI Panel)
- [x] Add trash/X icon to each conversation row in the conversations list (always visible)
- [x] Clicking delete shows a brief confirmation (browser confirm dialog) before deleting
- [x] Wire to tRPC conversations.delete procedure (deleteConversationThread)
- [x] After deletion, if the deleted conversation was active, auto-selects next available conversation
- [x] All 56 tests pass

## Layout Fix — Conversations Panel Button Clipping
- [x] Root cause: buttons used position:absolute which was clipped by the overflow:hidden from the truncate class on the title paragraph
- [x] Fix: replaced absolute positioning with flex row layout — title+date in a flex-1 min-w-0 div, buttons in a shrink-0 flex div — buttons can never be clipped
- [x] CSS/layout only — no backend changes
- [x] All 56 tests pass
