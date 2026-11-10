import { describe, expect, it } from "vitest";
import {
  assertBusinessFacingResponse,
  assertLongstopDateAccuracy,
  buildSlackDraftContext,
  MISSING_LONGSTOP_RESPONSE,
  MISSING_LONGSTOP_REVIEWER_NOTE,
  parseSlackDraft,
  slackDraftResponseFormat,
  type SlackDraftDeal,
} from "./slackDraft";

// This module imports only the pure draft helpers: no LLM, Slack or DB clients.
const deal: SlackDraftDeal = {
  name: "Project Harbour",
  targetCompany: "Harbour Ltd",
  buyerName: "Buyer Ltd",
  sellerName: "Seller Ltd",
  closingDate: "2027-02-15",
  longstopDate: "2027-04-30",
};
const businessResponse = "Completion remains subject to the outstanding conditions being satisfied.";
const lawyerGuidance = "Note: Lawyer judgement is required before this response is approved.";
const encodeDraft = (response = businessResponse, reviewer_notes = "") =>
  JSON.stringify({ response, reviewer_notes });

const targetDateFormats = [
  "2027-02-15",
  "15/2/2027",
  "15/02/2027",
  "15 Feb 2027",
  "15 February 2027",
];

function expectMissingLongstop(draft: ReturnType<typeof parseSlackDraft>) {
  expect(draft.response).toContain(MISSING_LONGSTOP_RESPONSE);
  expect(draft.reviewer_notes).toContain(MISSING_LONGSTOP_REVIEWER_NOTE);
  expect(draft.response).not.toContain(MISSING_LONGSTOP_REVIEWER_NOTE);
}

describe("Slack draft strict separated output", () => {
  it("requests exactly two required string fields with no extra properties", () => {
    expect(slackDraftResponseFormat.type).toBe("json_schema");
    expect(slackDraftResponseFormat.json_schema.strict).toBe(true);
    const schema = slackDraftResponseFormat.json_schema.schema;
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties).sort()).toEqual(["response", "reviewer_notes"]);
    expect(schema.properties.response.type).toBe("string");
    expect(schema.properties.reviewer_notes.type).toBe("string");
    expect(schema.required).toEqual(["response", "reviewer_notes"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("returns only the separated fields, trimmed, and allows empty private notes", () => {
    const draft = parseSlackDraft(encodeDraft(`  ${businessResponse}  `, "  "), deal);
    expect(draft).toEqual({ response: businessResponse, reviewer_notes: "" });
    expect(Object.keys(draft).sort()).toEqual(["response", "reviewer_notes"]);
  });

  it.each([
    ["plain-text legacy response", "We expect to close shortly."],
    ["malformed JSON", '{"response":"Approved","reviewer_notes":'],
    ["markdown-fenced JSON", '```json\n{"response":"Approved","reviewer_notes":""}\n```'],
    ["JSON with surrounding prose", `Here is the draft: ${encodeDraft()}`],
    ["empty output", ""],
    ["non-string object", { response: businessResponse, reviewer_notes: "" }],
    ["undefined output", undefined],
    ["null output", null],
  ])("rejects %s rather than returning a raw-text fallback", (_label, content) => {
    expect(() => parseSlackDraft(content, deal)).toThrow("valid separated draft");
  });

  it.each([
    ["extra property", { response: businessResponse, reviewer_notes: "", note: "private" }],
    ["missing response", { reviewer_notes: "Please check the SPA." }],
    ["missing reviewer_notes", { response: businessResponse }],
    ["both fields missing", {}],
    ["legacy draft field", { draft: businessResponse }],
    ["empty response", { response: "", reviewer_notes: "" }],
    ["whitespace-only response", { response: " \n ", reviewer_notes: "" }],
    ["non-string response", { response: 123, reviewer_notes: "" }],
    ["null reviewer_notes", { response: businessResponse, reviewer_notes: null }],
    ["non-string reviewer_notes", { response: businessResponse, reviewer_notes: [] }],
    ["array", [{ response: businessResponse, reviewer_notes: "" }]],
    ["JSON null", null],
  ])("rejects JSON with %s without falling back", (_label, content) => {
    expect(() => parseSlackDraft(JSON.stringify(content), deal)).toThrow(
      "both response and reviewer_notes as separate text fields",
    );
  });
});

describe("business answer and lawyer-only notes separation", () => {
  it("rejects the known lawyer-judgement guidance leak in the business response", () => {
    const response = `${businessResponse}\n\n${lawyerGuidance}`;
    expect(() => assertBusinessFacingResponse(response)).toThrow("Lawyer-only guidance");
    expect(() => parseSlackDraft(encodeDraft(response), deal)).toThrow("Lawyer-only guidance");
  });

  it("accepts the same guidance in private reviewer_notes without appending it to the answer", () => {
    const draft = parseSlackDraft(encodeDraft(businessResponse, lawyerGuidance), deal);
    expect(draft).toEqual({ response: businessResponse, reviewer_notes: lawyerGuidance });
    expect(draft.response).not.toContain(lawyerGuidance);
  });

  it("rejects a substantial private note pasted into the answer even without guidance keywords", () => {
    const notes = "Confirm the executed agreement contains the agreed termination mechanism before approval.";
    expect(() => parseSlackDraft(encodeDraft(`${businessResponse}\n${notes}`, notes), deal)).toThrow(
      "contains lawyer-only reviewer notes",
    );
    expect(() => assertBusinessFacingResponse(notes, notes)).toThrow("contains lawyer-only reviewer notes");
  });

  it("rejects a substantial pasted line from multiline notes despite case and whitespace changes", () => {
    const notes = "Confirm the executed agreement matches the negotiated termination mechanism.\nCheck the signature pages.";
    const response = `${businessResponse}\nCONFIRM   THE EXECUTED AGREEMENT MATCHES THE NEGOTIATED TERMINATION MECHANISM.`;
    expect(() => parseSlackDraft(encodeDraft(response, notes), deal)).toThrow("contains lawyer-only reviewer notes");
  });

  it.each([
    "Completion remains subject to regulatory approval and satisfaction of the conditions precedent.",
    "This timetable is provisional and depends on receipt of the remaining signatures.",
    "We cannot yet confirm completion; please do not treat the target closing date as guaranteed.",
  ])("preserves legitimate business-facing caveats: %s", (response) => {
    expect(assertBusinessFacingResponse(response, "Check the signed documents before approval.")).toBe(response);
    expect(parseSlackDraft(encodeDraft(response, "Check the signed documents before approval."), deal).response).toBe(response);
  });
});

describe("distinct target closing and long-stop context", () => {
  it("uses each field's own value when closingDate and longstopDate differ", () => {
    expect(buildSlackDraftContext(deal)).toMatchObject({
      transaction: "Project Harbour",
      target_company: "Harbour Ltd",
      buyer: "Buyer Ltd",
      seller: "Seller Ltd",
      target_closing_date: "2027-02-15",
      long_stop_date: "2027-04-30",
    });
    expect(buildSlackDraftContext(deal).date_rule).toContain("different fields");
  });

  it("supports Date objects without conflating the two business dates", () => {
    expect(buildSlackDraftContext({
      ...deal,
      closingDate: new Date("2027-02-15T00:00:00.000Z"),
      longstopDate: new Date("2027-04-30T00:00:00.000Z"),
    })).toMatchObject({ target_closing_date: "2027-02-15", long_stop_date: "2027-04-30" });
  });

  it("supports the database's unzoned datetime representation", () => {
    expect(buildSlackDraftContext({
      ...deal,
      closingDate: "2027-02-15 00:00:00",
      longstopDate: "2027-04-30 00:00:00",
    })).toMatchObject({ target_closing_date: "2027-02-15", long_stop_date: "2027-04-30" });
  });

  it.each([undefined, null])("keeps missing longstopDate (%s) null even with a target closing date", (longstopDate) => {
    const missingDeal = { ...deal, longstopDate };
    expect(buildSlackDraftContext(missingDeal)).toMatchObject({
      target_closing_date: "2027-02-15",
      long_stop_date: null,
    });
    expectMissingLongstop(parseSlackDraft(encodeDraft(), missingDeal));
  });

  it("keeps both date fields explicitly null when the assigned deal has no dates", () => {
    const undatedDeal = { name: "Undated deal", closingDate: null, longstopDate: null };
    expect(buildSlackDraftContext(undatedDeal)).toMatchObject({
      target_closing_date: null,
      long_stop_date: null,
    });
    expectMissingLongstop(parseSlackDraft(encodeDraft(), undatedDeal));
  });

  it("represents no assigned deal with null transaction and dates, and flags missing long-stop information", () => {
    expect(buildSlackDraftContext()).toMatchObject({
      transaction: null,
      target_closing_date: null,
      long_stop_date: null,
    });
    expect(buildSlackDraftContext().date_rule).toContain("No deal is assigned");
    expectMissingLongstop(parseSlackDraft(encodeDraft()));
  });
});

describe("long-stop accuracy and missing-date safeguards", () => {
  it.each(targetDateFormats)("rejects target closing date %s presented as the recorded long-stop date", (date) => {
    const response = `The long-stop date is ${date}.`;
    expect(() => assertLongstopDateAccuracy(response, deal)).toThrow("target closing date");
    expect(() => parseSlackDraft(encodeDraft(response), deal)).toThrow("target closing date");
  });

  it.each(targetDateFormats)("never substitutes target date %s when no long-stop is recorded", (date) => {
    expect(() => parseSlackDraft(
      encodeDraft(`The longstop date is ${date}.`),
      { ...deal, longstopDate: null },
    )).toThrow("No long-stop date is recorded");
  });

  it.each(["2027-08-20", "20/08/2027", "20 August 2027", "20 Aug 2027"])(
    "rejects a hallucinated long-stop date %s for an undated or unassigned intake",
    (date) => {
      const content = encodeDraft(`The long stop date is ${date}.`);
      expect(() => parseSlackDraft(content, { name: "Undated deal", closingDate: null, longstopDate: null })).toThrow(
        "No long-stop date is recorded",
      );
      expect(() => parseSlackDraft(content)).toThrow("No long-stop date is recorded");
    },
  );

  it.each(["2027-04-30", "30/04/2027", "30 Apr 2027", "30 April 2027"])(
    "accepts the actual recorded long-stop value %s without adding missing-date warnings",
    (date) => {
      const response = `The recorded long-stop date is ${date}.`;
      expect(() => assertLongstopDateAccuracy(response, deal)).not.toThrow();
      expect(parseSlackDraft(encodeDraft(response), deal)).toEqual({ response, reviewer_notes: "" });
    },
  );

  it("allows a target closing date in a distinct sentence from the actual long-stop date", () => {
    const response = "The target closing date is 2027-02-15. The long-stop date is 2027-04-30.";
    expect(parseSlackDraft(encodeDraft(response), deal).response).toBe(response);
  });

  it("preserves a clearly labelled target date but states missing long-stop information in both channels", () => {
    const response = "The target closing date is 15 February 2027, subject to outstanding conditions.";
    const draft = parseSlackDraft(encodeDraft(response, "Confirm the outstanding conditions."), { ...deal, longstopDate: null });
    expect(draft.response).toBe(`${response}\n\n${MISSING_LONGSTOP_RESPONSE}`);
    expect(draft.reviewer_notes).toBe(`Confirm the outstanding conditions.\n\n${MISSING_LONGSTOP_REVIEWER_NOTE}`);
    expectMissingLongstop(draft);
  });

  it("does not duplicate explicit missing-long-stop statements or private flags", () => {
    const draft = parseSlackDraft(
      encodeDraft(MISSING_LONGSTOP_RESPONSE, MISSING_LONGSTOP_REVIEWER_NOTE),
      { ...deal, longstopDate: null },
    );
    expect(draft).toEqual({ response: MISSING_LONGSTOP_RESPONSE, reviewer_notes: MISSING_LONGSTOP_REVIEWER_NOTE });
    expect(parseSlackDraft(JSON.stringify(draft), { ...deal, longstopDate: null })).toEqual(draft);
  });
});
