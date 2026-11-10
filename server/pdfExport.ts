import * as fs from "fs";
import * as path from "path";
import type { Express, Request, Response } from "express";
import PDFDocument from "pdfkit";
import { getDealById, getChecklistItems } from "./db";
import { sdk } from "./_core/sdk";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  navy: "#0f2044",
  text: "#1e293b",
  muted: "#64748b",
  subtle: "#94a3b8",
  border: "#e2e8f0",
  rowSep: "#f1f5f9",
  executed: "#16a34a",
  underReview: "#d97706",
  outstanding: "#dc2626",
  waived: "#6b7280",
  bgCard: "#f8fafc",
};

const STATUS_COLOURS: Record<string, string> = {
  Executed: C.executed,
  "Under Review": C.underReview,
  Outstanding: C.outstanding,
  Waived: C.waived,
};

// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE_H = 841.89;   // A4 height in points
const MARGIN = 50;
const CONTENT_W = 495;   // 595.28 - 2*50
const FOOTER_Y = PAGE_H - 36;
const CONTENT_BOTTOM = FOOTER_Y - 10; // last usable y before footer

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Replace spaces with non-breaking spaces so pdfkit never wraps mid-word. */
function nbspc(s: string): string {
  return s.replace(/ /g, "\u00A0");
}

function formatDate(ts: number | Date | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts as number).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function daysInStatus(ts: number | null | undefined): string {
  if (!ts || ts <= 0) return "—";
  const ms = Date.now() - ts;
  if (ms < 0) return "—";
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "<1 day";
  return days === 1 ? "1 day" : `${days} days`;
}

function daysUntil(ts: number | Date | null | undefined): number | null {
  if (!ts) return null;
  return Math.ceil((new Date(ts as number).getTime() - Date.now()) / 86_400_000);
}

const PARTY_ENUM_LABELS: Record<string, string> = {
  buyer_counsel: "Buyer's Counsel",
  seller_counsel: "Seller's Counsel",
  bank: "Bank",
  all: "All Parties",
  other: "Other",
};

/**
 * Resolve the human-readable party label for a checklist item.
 *
 * The frontend stores party data in partiesJson as a JSON array of display
 * names (e.g. ["BlackStone Ridge Capital LLP", "Meridian Holdings Group plc"]).
 * When the lawyer selects "All Parties" in the multi-select, the frontend
 * stores the literal string "All Parties" as one of the entries in that array
 * (via the ALL_PARTIES_KEY constant in PartyMultiSelect.tsx).
 *
 * Resolution priority:
 *   1. partiesJson array — if it contains "All Parties" sentinel → "All Parties"
 *                          otherwise join the names (filtering out the sentinel)
 *   2. partyLabel        — legacy single-party display name
 *   3. partyCustom       — free-text "Other" name
 *   4. party enum        — map raw enum to readable label
 */
function resolvePartyLabel(item: {
  partiesJson: string | null | undefined;
  partyLabel: string | null | undefined;
  partyCustom: string | null | undefined;
  party: string | null | undefined;
}): string {
  if (item.partiesJson) {
    try {
      const arr = JSON.parse(item.partiesJson) as string[];
      if (arr.length > 0) {
        // The frontend stores "All Parties" as a literal sentinel in the array
        // when the lawyer selects the "All Parties" option.
        if (arr.includes("All Parties")) return "All Parties";
        // Filter out any accidental sentinel and join the real names.
        const names = arr.filter((n) => n !== "All Parties");
        if (names.length > 0) return names.join(", ");
      }
    } catch { /* fall through */ }
  }
  // Legacy single-party fields
  if (item.party === "all") return "All Parties";
  if (item.partyLabel) return item.partyLabel;
  if (item.partyCustom) return item.partyCustom;
  if (item.party) return PARTY_ENUM_LABELS[item.party] ?? item.party;
  return "—";
}

const LOGO_PATH = path.resolve(
  process.cwd(),
  "../webdev-static-assets/cr-logo-128.png"
);

// ── Drawing helpers ───────────────────────────────────────────────────────────

/**
 * FIX 5: Draw footer at a fixed absolute position on the current page.
 * Called once per page immediately before doc.addPage() or doc.end().
 */
function drawFooter(doc: PDFKit.PDFDocument, exportedAt: string, pageNum: number) {
  // Save doc.y before writing footer text at an absolute y near the bottom of
  // the page.  Without this, pdfkit advances doc.y to FOOTER_Y + line-height
  // (~815pt on A4), which exceeds the page boundary and triggers an unwanted
  // automatic page break, producing blank pages.
  const savedY = doc.y;
  doc
    .font("Helvetica").fontSize(7.5).fillColor(C.subtle)
    .text(`Exported ${exportedAt} · ClosingRoom`, MARGIN, FOOTER_Y, {
      width: 350, align: "left", lineBreak: false,
    })
    .text(`Page ${pageNum}`, MARGIN + 350, FOOTER_Y, {
      width: 145, align: "right", lineBreak: false,
    });
  // Restore doc.y so subsequent content (or doc.addPage()) is not confused.
  doc.y = savedY;
}

/** Draw a horizontal rule at doc.y. */
function hr(doc: PDFKit.PDFDocument, colour = C.border, weight = 1) {
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y)
    .strokeColor(colour).lineWidth(weight).stroke();
}

/**
 * Ensure there is enough vertical space remaining on the current page.
 * If not, add a new page and draw the compact continuation header.
 * Footers are drawn retroactively via bufferPages/switchToPage after all
 * content is written, so no footer call is needed here.
 */
function ensureSpace(
  doc: PDFKit.PDFDocument,
  needed: number,
  dealName: string,
  logoExists: boolean
): void {
  if (doc.y + needed > CONTENT_BOTTOM) {
    doc.addPage();
    drawCompactHeader(doc, dealName, logoExists);
  }
}

/** Compact deal-name header used at the top of continuation pages. */
function drawCompactHeader(
  doc: PDFKit.PDFDocument,
  dealName: string,
  logoExists: boolean
) {
  if (logoExists) {
    doc.image(LOGO_PATH, MARGIN, MARGIN, { width: 22, height: 22 });
  }
  doc
    .font("Helvetica-Bold").fontSize(11).fillColor(C.navy)
    .text(dealName, logoExists ? MARGIN + 28 : MARGIN, MARGIN + 5, { lineBreak: false });
  doc.y = MARGIN + 28;
  hr(doc, C.border, 0.5);
  doc.moveDown(0.5);
}

/** Draw a stat card (coloured number + label) at an absolute position. */
function statCard(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  value: string, label: string, valueColour: string
) {
  doc.rect(x, y, w, h).fillColor(C.bgCard).fill();
  doc.rect(x, y, w, h).strokeColor(C.border).lineWidth(0.5).stroke();
  doc
    .font("Helvetica-Bold").fontSize(22).fillColor(valueColour)
    .text(value, x, y + 10, { width: w, align: "center", lineBreak: false });
  // FIX 1: use absolute x/y for the label so it always renders horizontally
  doc
    .font("Helvetica").fontSize(8).fillColor(C.muted)
    .text(label, x, y + 36, { width: w, align: "center", lineBreak: false });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export function registerPdfExportRoute(app: Express) {
  app.get("/api/deals/:dealId/export-pdf", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) { res.status(401).json({ error: "Unauthorised" }); return; }

      const dealId = parseInt(req.params.dealId, 10);
      if (isNaN(dealId)) { res.status(400).json({ error: "Invalid deal ID" }); return; }

      const deal = await getDealById(dealId, user.id);
      if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }

      const allItems = await getChecklistItems(dealId);

      // ── Aggregate statistics ──────────────────────────────────────────────
      const total = allItems.length;
      const executed = allItems.filter((i) => i.status === "Executed").length;
      const underReview = allItems.filter((i) => i.status === "Under Review").length;
      const outstanding = allItems.filter((i) => i.status === "Outstanding").length;
      const waived = allItems.filter((i) => i.status === "Waived").length;
      const progress = total > 0 ? Math.round(((executed + waived) / total) * 100) : 0;

      const SECTION_KEYS = ["conditions_precedent", "transaction_documents", "post_closing"] as const;
      const SECTION_LABELS: Record<string, string> = {
        conditions_precedent: "Conditions Precedent",
        transaction_documents: "Transaction Documents",
        post_closing: "Post-Closing",
      };

      const sectionStats = SECTION_KEYS.map((key) => {
        const items = allItems.filter((i) => i.section === key);
        return {
          key, label: SECTION_LABELS[key], total: items.length,
          executed: items.filter((i) => i.status === "Executed").length,
          underReview: items.filter((i) => i.status === "Under Review").length,
          outstanding: items.filter((i) => i.status === "Outstanding").length,
          waived: items.filter((i) => i.status === "Waived").length,
        };
      });

      const sections = SECTION_KEYS.map((key) => ({
        title: SECTION_LABELS[key],
        items: allItems.filter((i) => i.section === key),
      }));

      const daysToClose = daysUntil(deal.closingDate);

      const exportedAt = new Date().toLocaleString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZoneName: "short",
      });

       const logoExists = fs.existsSync(LOGO_PATH);
      // ── Build PDF ─────────────────────────────────────────────────────────
      // Use bufferPages so we can retroactively draw footers on every page
      // via switchToPage() without triggering pdfkit's auto-page-break logic.
      const doc = new PDFDocument({ margin: MARGIN, size: "A4", autoFirstPage: true, bufferPages: true });
      const filename = `${deal.name.replace(/[^a-z0-9]/gi, "_")}_Checklist.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      doc.pipe(res);
      // pageNum is no longer needed — footers are drawn retroactively via bufferPages

      // ════════════════════════════════════════════════════════════════════════
      //  PAGE 1 — SUMMARY
      // ════════════════════════════════════════════════════════════════════════

      // ── Deal header (logo + name + structure) ─────────────────────────────
      const LOGO_SIZE = 40;
      const headerY = MARGIN;
      const textX = logoExists ? MARGIN + LOGO_SIZE + 12 : MARGIN;

      if (logoExists) {
        doc.image(LOGO_PATH, MARGIN, headerY, { width: LOGO_SIZE, height: LOGO_SIZE });
      }
      doc.font("Helvetica-Bold").fontSize(20).fillColor(C.navy)
        .text(deal.name, textX, headerY + 2, { lineBreak: false });

      if (deal.dealStructure) {
        // FIX 1: use absolute coordinates so the structure line is always horizontal
        const structY = headerY + 26;
        doc.font("Helvetica").fontSize(10).fillColor(C.muted)
          .text(deal.dealStructure, textX, structY, { lineBreak: false });
      }

      doc.y = Math.max(doc.y, headerY + LOGO_SIZE + 8);
      doc.moveDown(0.4);
      hr(doc);
      doc.moveDown(0.6);

      // ── Deal details two-column table ──────────────────────────────────────
      const detailRows: [string, string][] = [];
      if (deal.targetCompany) detailRows.push(["Target Company", deal.targetCompany]);
      if (deal.buyerName) detailRows.push(["Buyer", deal.buyerName]);
      if (deal.sellerName) detailRows.push(["Seller", deal.sellerName]);
      if (deal.buyerCounsel) detailRows.push(["Buyer's Counsel", deal.buyerCounsel]);
      if (deal.sellerCounsel) detailRows.push(["Seller's Counsel", deal.sellerCounsel]);
      if (deal.dealValue) detailRows.push(["Deal Value", deal.dealValue]);
      if (deal.governingLaw) detailRows.push(["Governing Law", deal.governingLaw]);
      if (deal.closingDate) detailRows.push(["Target Closing Date", formatDate(deal.closingDate)]);
      if (deal.longstopDate) detailRows.push(["Longstop Date", formatDate(deal.longstopDate)]);

      if (detailRows.length > 0) {
        const half = Math.ceil(detailRows.length / 2);
        const leftCol = detailRows.slice(0, half);
        const rightCol = detailRows.slice(half);
        const labelW = 105;
        const valW = 135;
        const leftX = MARGIN;
        const rightX = MARGIN + 255;
        const rowH = 15;
        const startY = doc.y;

        for (let i = 0; i < Math.max(leftCol.length, rightCol.length); i++) {
          const y = startY + i * rowH;
          if (leftCol[i]) {
            doc.font("Helvetica-Bold").fontSize(8).fillColor(C.muted)
              .text(leftCol[i][0], leftX, y, { width: labelW, lineBreak: false });
            doc.font("Helvetica").fontSize(8).fillColor(C.text)
              .text(leftCol[i][1], leftX + labelW + 6, y, { width: valW, lineBreak: false });
          }
          if (rightCol[i]) {
            doc.font("Helvetica-Bold").fontSize(8).fillColor(C.muted)
              .text(rightCol[i][0], rightX, y, { width: labelW, lineBreak: false });
            doc.font("Helvetica").fontSize(8).fillColor(C.text)
              .text(rightCol[i][1], rightX + labelW + 6, y, { width: valW, lineBreak: false });
          }
        }
        doc.y = startY + Math.max(leftCol.length, rightCol.length) * rowH + 4;
      }

      doc.moveDown(0.6);
      hr(doc);
      doc.moveDown(0.6);

      // ── Overall progress bar ───────────────────────────────────────────────
      // FIX 1: use absolute y coordinate for the label so it is always horizontal
      const progLabelY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text)
        .text("Overall Progress", MARGIN, progLabelY, { lineBreak: false });
      doc.y = progLabelY + 14;

      const barY = doc.y;
      const barW = CONTENT_W;
      const barH = 10;
      doc.rect(MARGIN, barY, barW, barH).fillColor(C.border).fill();
      if (progress > 0) {
        doc.rect(MARGIN, barY, Math.round((barW * progress) / 100), barH).fillColor(C.navy).fill();
      }
      doc.y = barY + barH + 4;
      doc.font("Helvetica").fontSize(9).fillColor(C.muted)
        .text(
          `${progress}% complete  (${executed + waived} of ${total} items resolved)`,
          MARGIN, doc.y, { lineBreak: false }
        );
      doc.y += 12;
      doc.moveDown(0.4);

      // ── Status stat cards (4 across) + days-to-closing ────────────────────
      const cardW = 90;
      const cardH = 56;
      const cardGap = 8;
      const cardsY = doc.y;

      const cards = [
        { value: String(executed),   label: "Executed",     colour: C.executed },
        { value: String(underReview), label: "Under Review", colour: C.underReview },
        { value: String(outstanding), label: "Outstanding",  colour: C.outstanding },
        { value: String(waived),      label: "Waived",       colour: C.waived },
      ];

      cards.forEach((card, i) => {
        statCard(doc, MARGIN + i * (cardW + cardGap), cardsY, cardW, cardH, card.value, card.label, card.colour);
      });

      // Days-to-closing card
      if (daysToClose !== null) {
        const dtcX = MARGIN + 4 * (cardW + cardGap);
        const dtcW = MARGIN + CONTENT_W - dtcX;
        const dtcColour = daysToClose <= 14 ? C.outstanding : daysToClose <= 30 ? C.underReview : C.executed;
        // FIX 1: use absolute y for both value and label inside this card
        const dtcLabel = daysToClose <= 0 ? "PAST CLOSING DATE" : "DAYS TO CLOSING";
        const dtcValue = daysToClose <= 0 ? `${Math.abs(daysToClose)}d overdue` : String(daysToClose);

        doc.rect(dtcX, cardsY, dtcW, cardH).fillColor(C.bgCard).fill();
        doc.rect(dtcX, cardsY, dtcW, cardH).strokeColor(C.border).lineWidth(0.5).stroke();
        doc.font("Helvetica-Bold").fontSize(22).fillColor(dtcColour)
          .text(dtcValue, dtcX, cardsY + 10, { width: dtcW, align: "center", lineBreak: false });
        doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
          .text(dtcLabel, dtcX, cardsY + 34, { width: dtcW, align: "center", lineBreak: false });
      }

      doc.y = cardsY + cardH + 12;
      hr(doc);
      doc.moveDown(0.6);

      // ── Per-section breakdown table ────────────────────────────────────────
      // FIX 3: pre-compute the table height and ensure it fits on one page.
      // Each row is ~16pt; header + 3 data rows + totals row + separators ≈ 120pt.
      const TABLE_HEIGHT = 120;
      ensureSpace(doc, TABLE_HEIGHT, deal.name, logoExists);

      // FIX 1: use absolute y for the section heading so it is always horizontal
      const tHeadingY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text)
        .text("Checklist Breakdown by Section", MARGIN, tHeadingY, { lineBreak: false });
      doc.y = tHeadingY + 16;

      // Widened review/outstanding columns (70pt each) so headers fit without word-breaking.
      const tColX = { section: MARGIN, total: 195, exec: 250, review: 315, out: 385, waived: 455 };
      const tColW = { section: 140, total: 50, exec: 60, review: 65, out: 65, waived: 90 };

      // Table column headers
      const thY = doc.y;
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.subtle);
      doc.text("SECTION",      tColX.section, thY, { width: tColW.section, lineBreak: false });
      doc.text("TOTAL",        tColX.total,   thY, { width: tColW.total,   align: "center", lineBreak: false });
      doc.text("EXECUTED",     tColX.exec,    thY, { width: tColW.exec,    align: "center", lineBreak: false });
      doc.text(nbspc("UNDER REVIEW"), tColX.review, thY, { width: tColW.review, align: "center", lineBreak: false });
      doc.text(nbspc("OUTSTANDING"),  tColX.out,     thY, { width: tColW.out,    align: "center", lineBreak: false });
      doc.text("WAIVED",       tColX.waived,  thY, { width: tColW.waived, align: "center", lineBreak: false });

      doc.y = thY + 12;
      hr(doc, C.border, 0.5);
      doc.y += 4;

      // Data rows — FIX 3: all drawn at absolute y positions, no moveDown
      const rowH = 16;
      for (let ri = 0; ri < sectionStats.length; ri++) {
        const sec = sectionStats[ri];
        const secProgress = sec.total > 0 ? Math.round(((sec.executed + sec.waived) / sec.total) * 100) : 0;
        const rowY = doc.y;

        doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text)
          .text(sec.label, tColX.section, rowY, { width: tColW.section, lineBreak: false });
        doc.font("Helvetica").fontSize(9).fillColor(C.muted)
          .text(`${sec.total} (${secProgress}%)`, tColX.total, rowY, { width: tColW.total, align: "center", lineBreak: false });
        doc.font("Helvetica").fontSize(9).fillColor(C.executed)
          .text(String(sec.executed), tColX.exec, rowY, { width: tColW.exec, align: "center", lineBreak: false });
        doc.font("Helvetica").fontSize(9).fillColor(C.underReview)
          .text(String(sec.underReview), tColX.review, rowY, { width: tColW.review, align: "center", lineBreak: false });
        doc.font("Helvetica").fontSize(9).fillColor(C.outstanding)
          .text(String(sec.outstanding), tColX.out, rowY, { width: tColW.out, align: "center", lineBreak: false });
        doc.font("Helvetica").fontSize(9).fillColor(C.waived)
          .text(String(sec.waived), tColX.waived, rowY, { width: tColW.waived, align: "center", lineBreak: false });

        doc.y = rowY + rowH;
        doc.moveTo(MARGIN, doc.y - 2).lineTo(MARGIN + CONTENT_W, doc.y - 2)
          .strokeColor(C.rowSep).lineWidth(0.5).stroke();
      }

      // Totals row
      const totY = doc.y + 2;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text)
        .text("TOTAL", tColX.section, totY, { width: tColW.section, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted)
        .text(`${total} (${progress}%)`, tColX.total, totY, { width: tColW.total, align: "center", lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.executed)
        .text(String(executed), tColX.exec, totY, { width: tColW.exec, align: "center", lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.underReview)
        .text(String(underReview), tColX.review, totY, { width: tColW.review, align: "center", lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.outstanding)
        .text(String(outstanding), tColX.out, totY, { width: tColW.out, align: "center", lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.waived)
        .text(String(waived), tColX.waived, totY, { width: tColW.waived, align: "center", lineBreak: false });

      doc.y = totY + rowH;
      hr(doc, C.border, 0.5);
      doc.moveDown(0.8);

      // ════════════════════════════════════════════════════════════════════════
      //  CHECKLIST SECTIONS — flow continuously, no forced page breaks
      // ════════════════════════════════════════════════════════════════════════

      // Column layout for checklist items
      // Widened party column (150pt) so names like 'BlackStone Ridge Capital LLP' fit on one line.
      const colX = { name: MARGIN, status: 240, party: 305, duration: 455 };
      const colW = { name: 190, status: 65, party: 150, duration: 90 };

      // Height estimates
      const COL_HEADER_H = 22;  // column label row + separator
      const ITEM_ROW_H = 18;    // one item row + separator
      const SECTION_HEADING_H = 28; // section title + gap

      for (const section of sections) {
        if (section.items.length === 0) continue;

        // FIX 4: only add a page break if there is not enough room for the
        // section heading + column headers + at least one item row.
        const minSectionH = SECTION_HEADING_H + COL_HEADER_H + ITEM_ROW_H;
        ensureSpace(doc, minSectionH, deal.name, logoExists);

        // Section heading — FIX 1: absolute y, lineBreak: false
        const secHeadY = doc.y;
        doc.font("Helvetica-Bold").fontSize(13).fillColor(C.text)
          .text(nbspc(section.title.toUpperCase()), MARGIN, secHeadY, { lineBreak: false });
        doc.y = secHeadY + SECTION_HEADING_H;

        // Column headers
        const chY = doc.y;
        doc.font("Helvetica-Bold").fontSize(8).fillColor(C.subtle);
        doc.text("ITEM",      colX.name,     chY, { width: colW.name, lineBreak: false });
        doc.text("STATUS",    colX.status,   chY, { width: colW.status, lineBreak: false });
        doc.text("PARTY",     colX.party,    chY, { width: colW.party, lineBreak: false });
        doc.text(nbspc("IN STATUS"), colX.duration, chY, { width: colW.duration, lineBreak: false });
        doc.y = chY + 12;
        hr(doc, C.border, 0.5);
        doc.y += 4;

        // Item rows
        for (const item of section.items) {
          // FIX 4: check space before each row
          ensureSpace(doc, ITEM_ROW_H, deal.name, logoExists);

          const rowY = doc.y;
          const colour = STATUS_COLOURS[item.status] ?? C.muted;

          doc.font("Helvetica").fontSize(8.5).fillColor(C.text)
            .text(item.title, colX.name, rowY, { width: colW.name, lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(8).fillColor(colour)
            .text(nbspc(item.status), colX.status, rowY, { width: colW.status, lineBreak: false });
          doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
            .text(nbspc(resolvePartyLabel(item)), colX.party, rowY, { width: colW.party, lineBreak: false });
          doc.font("Helvetica").fontSize(8).fillColor(C.muted)
            .text(daysInStatus(item.statusChangedAt ?? undefined), colX.duration, rowY, { width: colW.duration, lineBreak: false });

          doc.y = rowY + ITEM_ROW_H;
          doc.moveTo(MARGIN, doc.y - 3).lineTo(MARGIN + CONTENT_W, doc.y - 3)
            .strokeColor(C.rowSep).lineWidth(0.5).stroke();
        }

        doc.moveDown(0.6);
      }

      // Draw footers retroactively on every buffered page.
      // Temporarily expand page height so pdfkit does not trigger an auto-page-break
      // when we write text at FOOTER_Y (~806pt on A4, near the 841.89pt page edge).
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const origH = doc.page.height;
        const origBM = doc.page.margins.bottom;
        doc.page.height = 2000;
        doc.page.margins.bottom = 0;
        doc
          .font("Helvetica").fontSize(7.5).fillColor(C.subtle)
          .text(`Exported ${exportedAt} \u00b7 ClosingRoom`, MARGIN, FOOTER_Y, {
            width: 350, align: "left", lineBreak: false,
          })
          .text(`Page ${i + 1} of ${range.count}`, MARGIN + 350, FOOTER_Y, {
            width: 145, align: "right", lineBreak: false,
          });
        doc.page.height = origH;
        doc.page.margins.bottom = origBM;
      }
      doc.flushPages();
      doc.end();
    } catch (err) {
      console.error("[PDF export]", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate PDF" });
      }
    }
  });
}
