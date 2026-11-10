import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildDealOptions, buildIntakeModalView, extractModalValue, extractSelectedDealId, markdownToSlackMrkdwn } from "./slack";

// Strict schema for the Block Kit subset used by this modal, derived from:
// https://docs.slack.dev/reference/views/modal-views/
// https://docs.slack.dev/reference/block-kit/blocks/input-block/
// https://docs.slack.dev/reference/block-kit/block-elements/select-menu-element
const plainText = (maxLength: number) => z.strictObject({
  type: z.literal("plain_text"),
  text: z.string().min(1).max(maxLength),
});
const modalElementSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("plain_text_input"),
    action_id: z.string().min(1).max(255),
    multiline: z.boolean(),
    placeholder: plainText(150),
  }),
  z.strictObject({
    type: z.literal("external_select"),
    action_id: z.string().min(1).max(255),
    min_query_length: z.number().int().nonnegative(),
    placeholder: plainText(150),
  }),
]);
const modalSchema = z.strictObject({
  type: z.literal("modal"),
  callback_id: z.string().max(255),
  title: plainText(24),
  submit: plainText(24),
  close: plainText(24),
  private_metadata: z.string().max(3000),
  blocks: z.array(z.strictObject({
    type: z.literal("input"),
    block_id: z.string().min(1).max(255),
    label: plainText(2000),
    optional: z.boolean().optional(),
    element: modalElementSchema,
  })).min(1).max(100),
});

describe("Slack intake modal values", () => {
  it("reads exact block and action IDs and trims plain-text input values", () => {
    const state = {
      values: {
        query_block: { query_input: { value: "  Can we extend the long-stop date?  " } },
        deal_block: { deal_input: { value: "  Project Emerald  " } },
      },
    };

    expect(extractModalValue(state, "query_block", "query_input")).toBe("Can we extend the long-stop date?");
    expect(extractModalValue(state, "deal_block", "deal_input")).toBe("Project Emerald");
    expect(extractModalValue(state, "query_block", "wrong_action")).toBe("");
  });

  it("returns an empty value only when the exact input is missing or blank", () => {
    expect(extractModalValue({ values: { query_block: { query_input: { value: "   " } } } }, "query_block", "query_input")).toBe("");
    expect(extractModalValue(undefined, "query_block", "query_input")).toBe("");
  });

  it("reads the selected deal ID from Slack's selected_option value", () => {
    expect(extractSelectedDealId({
      values: { deal_block: { deal_select: { selected_option: { value: "42" } } } },
    })).toBe(42);
  });

  it("leaves the intake unassigned when no deal is selected", () => {
    expect(extractSelectedDealId({ values: { deal_block: { deal_select: {} } } })).toBeUndefined();
    expect(extractSelectedDealId(undefined)).toBeUndefined();
  });

  it("filters deal options case-insensitively and returns deal IDs", () => {
    const options = buildDealOptions([
      { id: 1, name: "Project Falcon" },
      { id: 2, name: "Project Emerald" },
      { id: 3, name: "Titan Acquisition" },
    ], "EMERALD");

    expect(options).toEqual([
      { text: { type: "plain_text", text: "Project Emerald" }, value: "2" },
    ]);
  });

  it("returns no more than 100 deal options", () => {
    const deals = Array.from({ length: 101 }, (_, id) => ({ id: id + 1, name: `Deal ${id + 1}` }));
    expect(buildDealOptions(deals)).toHaveLength(100);
  });

  it("returns valid Slack option text and value lengths without truncating deal IDs", () => {
    const options = buildDealOptions([{ id: 90004, name: "Project " + "x".repeat(100) }]);
    const optionSchema = z.strictObject({
      text: plainText(75),
      value: z.string().min(1).max(150),
    });
    expect(optionSchema.safeParse(options[0]).success).toBe(true);
    expect(options[0].text.text).toHaveLength(75);
    expect(options[0].value).toBe("90004");
  });

  it("builds a Block Kit-compatible modal without an options URL", () => {
    const view = buildIntakeModalView("{}");
    expect(modalSchema.safeParse(view).success).toBe(true);
    expect(view.type).toBe("modal");
    expect(view.blocks).toHaveLength(2);

    const queryBlock = view.blocks[0];
    expect(queryBlock).toMatchObject({ type: "input", block_id: "query_block" });
    expect(queryBlock.element).toMatchObject({ type: "plain_text_input", action_id: "query_input" });

    const dealBlock = view.blocks[1];
    expect(dealBlock).toMatchObject({ type: "input", block_id: "deal_block", optional: true });
    expect(dealBlock.label).toEqual({ type: "plain_text", text: "Deal" });
    expect(dealBlock.element).toEqual({
      type: "external_select",
      action_id: "deal_select",
      min_query_length: 0,
      placeholder: { type: "plain_text", text: "Search ClosingRoom deals" },
    });
    expect("options_url" in dealBlock.element).toBe(false);
  });

  it("rejects the previous invalid options_url property with the strict Block Kit schema", () => {
    const view = buildIntakeModalView("{}");
    const invalidView = {
      ...view,
      blocks: [view.blocks[0], {
        ...view.blocks[1],
        element: { ...view.blocks[1].element, options_url: "https://closingroom.manus.space/api/slack/options" },
      }],
    };
    expect(modalSchema.safeParse(invalidView).success).toBe(false);
  });

  it("converts Clark Markdown to Slack mrkdwn", () => {
    expect(markdownToSlackMrkdwn("**Important**\n- Review the [deal](https://example.com/deal)"))
      .toBe("*Important*\n• Review the <https://example.com/deal|deal>");
  });

  it("converts headings, underscore bold, and alternative bullet markers", () => {
    expect(markdownToSlackMrkdwn("## Review\n* __Buyer consent__\n+ **Two-week extension**"))
      .toBe("Review\n• *Buyer consent*\n• *Two-week extension*");
  });
});
