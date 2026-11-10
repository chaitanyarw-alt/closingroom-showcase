import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/env", () => ({ ENV: {
  slackSigningSecret: "test-signing-secret", slackBotToken: "test-bot-token",
  slackReviewChannelId: "review-channel", ownerOpenId: "test-owner",
} }));
vi.mock("./db", () => ({
  createSlackIntake: vi.fn(), getAllDealsForDashboard: vi.fn(), getDealById: vi.fn(),
  getSlackWorkspaceLink: vi.fn(), getSlackWorkspaceDeals: vi.fn(), getSlackWorkspaceDealById: vi.fn(),
  getSlackIntakeById: vi.fn(), getUserByOpenId: vi.fn(), linkSlackIntakeToDeal: vi.fn(),
  markSlackIntakeFailed: vi.fn(), markSlackIntakePosted: vi.fn(), updateSlackIntakeDraft: vi.fn(),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { registerSlackRoutes, SLACK_NOT_CONNECTED, postApprovedSlackResponse } from "./slack";

const TEAM = "T00000TEST0";
const OWN_DEALS = [{ id: 7, name: "Project Titan" }, { id: 8, name: "Project Emerald" }, { id: 10, name: "Project Falcon" }];
type Handler = (req: Request, res: Response) => Promise<unknown>;
const routes = new Map<string, Handler>();
registerSlackRoutes({ post: (path: string, ...handlers: Handler[]) => routes.set(path, handlers.at(-1)!) } as unknown as Express);
const fetchMock = vi.fn();
const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
function headersForRawBody(rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `v0=${crypto.createHmac("sha256", "test-signing-secret").update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return { "Content-Type": "application/x-www-form-urlencoded", "X-Slack-Request-Timestamp": timestamp, "X-Slack-Signature": signature };
}
function signedRequest(body: Record<string, string>) {
  const rawBody = new URLSearchParams(body).toString();
  const headers = headersForRawBody(rawBody);
  return { body, rawBody, headers: { host: "closingroom.manus.space", "content-type": headers["Content-Type"],
    "x-slack-request-timestamp": headers["X-Slack-Request-Timestamp"], "x-slack-signature": headers["X-Slack-Signature"] } } as unknown as Request;
}
function response() {
  const res = { status: vi.fn(), send: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
async function call(path: string, req: Request) {
  const res = response();
  await routes.get(path)!(req, res as unknown as Response);
  return res;
}
function optionsPayload(value = "", teamId = TEAM) {
  return { type: "block_suggestion", action_id: "deal_select", block_id: "deal_block", value,
    user: { id: "UUNLINKED" }, team: { id: teamId } };
}
function optionsRequest(value = "", teamId = TEAM) {
  return signedRequest({ payload: JSON.stringify(optionsPayload(value, teamId)) });
}
function submissionPayload(selectedValue: string | null = "7", teamId = TEAM) {
  return { type: "view_submission", team: { id: teamId }, user: { id: "UREQUESTER" }, view: {
    callback_id: "closingroom_intake_submission",
    private_metadata: JSON.stringify({ teamId, channelId: "origin-channel", userName: "Requester" }),
    state: { values: {
      query_block: { query_input: { value: "  Can we extend the deadline?  " } },
      deal_block: { deal_select: { selected_option: selectedValue === null ? null : { value: selectedValue } } },
    } },
  } };
}
function submission(selectedValue: string | null = "7", teamId = TEAM) {
  return signedRequest({ payload: JSON.stringify(submissionPayload(selectedValue, teamId)) });
}
function completedLog() {
  const entry = vi.mocked(console.log).mock.calls.find(([label]) => label === "[Slack options] completed");
  return JSON.parse(String(entry?.[1]));
}
function expectNoIntakeSideEffects() {
  expect(db.createSlackIntake).not.toHaveBeenCalled();
  expect(db.linkSlackIntakeToDeal).not.toHaveBeenCalled();
  expect(invokeLLM).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
}

beforeAll(async () => {
  const app = express();
  registerSlackRoutes(app);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  server = await new Promise<Server>((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, ts: "test-ts", view: { id: "VTEST" } }) });
  vi.mocked(db.getSlackWorkspaceLink).mockImplementation(async (teamId) => teamId === TEAM ? { teamId, ownerUserId: 1 } : undefined);
  vi.mocked(db.getSlackWorkspaceDeals).mockImplementation(async (teamId, ownerId) => teamId === TEAM && ownerId === 1 ? OWN_DEALS : []);
  vi.mocked(db.getSlackWorkspaceDealById).mockImplementation(async (teamId, ownerId, dealId) => {
    const deal = teamId === TEAM && ownerId === 1 ? OWN_DEALS.find((d) => d.id === dealId) : undefined;
    return deal ? { ...deal, userId: 1 } as never : undefined;
  });
  vi.mocked(db.createSlackIntake).mockResolvedValue(101);
  vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ response: "**Answer**\n- We need to confirm consent.", reviewer_notes: "Note: Lawyer judgement is required. Check buyer consent in the signed agreement." }) } }] } as never);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

 describe("signed, owner-scoped Slack routes", () => {
  it("calls views.open before any database or LLM work", async () => {
    fetchMock.mockImplementationOnce(async () => {
      expect(db.getSlackWorkspaceLink).not.toHaveBeenCalled();
      expect(db.getSlackWorkspaceDeals).not.toHaveBeenCalled();
      expect(invokeLLM).not.toHaveBeenCalled();
      return { ok: true, json: async () => ({ ok: true, view: { id: "VTEST" } }) };
    });
    const res = await call("/api/slack/commands", signedRequest({ trigger_id: "fresh-trigger", team_id: TEAM, channel_id: "origin-channel" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://slack.com/api/views.open");
    const payload = JSON.parse(init.body);
    expect(payload.trigger_id).toBe("fresh-trigger");
    expect(JSON.parse(payload.view.private_metadata).teamId).toBe(TEAM);
    expect(Object.keys(payload.view.blocks[1].element).sort()).toEqual(["action_id", "min_query_length", "placeholder", "type"]);
    expect(db.getUserByOpenId).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it("logs the complete views.open error", async () => {
    const payload = { ok: false, error: "invalid_arguments", response_metadata: { messages: ["invalid additional property: options_url"] } };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => payload });
    const res = await call("/api/slack/commands", signedRequest({ trigger_id: "fresh-trigger", team_id: TEAM }));
    expect(console.log).toHaveBeenCalledWith("[Slack API] views.open response", JSON.stringify(payload));
    expect(res.send).toHaveBeenCalledWith("ClosingRoom could not open the intake form. Please try again.");
  });
  it("returns only the mapped owner's three dashboard deals, never owner 60039's deal", async () => {
    const res = await call("/api/slack/options", optionsRequest());
    expect(db.getSlackWorkspaceDeals).toHaveBeenCalledWith(TEAM, 1);
    expect(db.getAllDealsForDashboard).not.toHaveBeenCalled();
    expect(db.getUserByOpenId).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json; charset=utf-8");
    expect(res.json).toHaveBeenCalledWith({ options: OWN_DEALS.map((deal) => ({ text: { type: "plain_text", text: deal.name }, value: String(deal.id) })) });
    const log = completedLog();
    expect(log.signaturePassed).toBe(true);
    expect(log.linkedOwnerUserId).toBe(1);
    expect(log.dealsQueryCount).toBe(3);
    expect(log.responseBody.options.some((option: { value: string }) => option.value === "60002")).toBe(false);
    expect(log.responseTimeMs).toBeLessThan(3000);
  });
  it("filters scoped options case-insensitively", async () => {
    const res = await call("/api/slack/options", optionsRequest("tItAn"));
    expect(res.json).toHaveBeenCalledWith({ options: [{ text: { type: "plain_text", text: "Project Titan" }, value: "7" }] });
  });
  it("does not query any deals for an unmapped team and shows the connection message", async () => {
    const payload = { ...optionsPayload("", "TUNKNOWN"), view: { id: "VUNKNOWN", private_metadata: "{}" } };
    const res = await call("/api/slack/options", signedRequest({ payload: JSON.stringify(payload) }));
    expect(res.json).toHaveBeenCalledWith({ options: [] });
    expect(db.getSlackWorkspaceDeals).not.toHaveBeenCalled();
    expect(completedLog().error).toBe(SLACK_NOT_CONNECTED);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const notice = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(notice.view.blocks[0].text.text).toBe(SLACK_NOT_CONNECTED);
    expect(notice.view.submit).toBeUndefined();
  });
  it("updates an unconnected slash-command modal only after opening it", async () => {
    await call("/api/slack/commands", signedRequest({ trigger_id: "fresh", team_id: "TUNKNOWN" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toContain("views.open");
    expect(fetchMock.mock.calls[1][0]).toContain("views.update");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).view.blocks[0].text.text).toBe(SLACK_NOT_CONNECTED);
  });
  it("rejects unsigned options before parsing or querying", async () => {
    const req = signedRequest({ payload: "not-json" }); req.headers["x-slack-signature"] = "invalid";
    const res = await call("/api/slack/options", req);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.getSlackWorkspaceLink).not.toHaveBeenCalled();
    expect(db.getSlackWorkspaceDeals).not.toHaveBeenCalled();
    expect(completedLog()).toMatchObject({ signaturePassed: false, payload: null, responseStatus: 401 });
  });
  it("does not reconstruct lost original request bytes", async () => {
    const req = optionsRequest(); delete (req as Request & { rawBody?: string }).rawBody;
    const res = await call("/api/slack/options", req);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.getSlackWorkspaceLink).not.toHaveBeenCalled();
  });
  it("fails closed for an unexpected suggestion action", async () => {
    const res = await call("/api/slack/options", signedRequest({ payload: JSON.stringify({ ...optionsPayload(), action_id: "other" }) }));
    expect(res.json).toHaveBeenCalledWith({ options: [] });
    expect(db.getSlackWorkspaceLink).not.toHaveBeenCalled();
  });
  it("logs database errors and returns exact empty options JSON", async () => {
    vi.mocked(db.getSlackWorkspaceDeals).mockRejectedValue(new Error("database offline"));
    const res = await call("/api/slack/options", optionsRequest());
    expect(res.json).toHaveBeenCalledWith({ options: [] });
    expect(completedLog().error).toBe("database offline");
  });
  it("caps mapping plus options query at 2.5 seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(db.getSlackWorkspaceDeals).mockImplementation(() => new Promise(() => undefined));
    const pending = call("/api/slack/options", optionsRequest());
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).json).toHaveBeenCalledWith({ options: [] });
    expect(completedLog().responseTimeMs).toBe(2500);
  });
  it("validates the selected ID before clear and persists team/owner on the intake", async () => {
    const res = await call("/api/slack/interactions", submission());
    expect(db.getSlackWorkspaceDealById).toHaveBeenCalledWith(TEAM, 1, 7);
    expect(res.json).toHaveBeenCalledWith({ response_action: "clear" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(db.createSlackIntake).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM, ownerUserId: 1, question: "Can we extend the deadline?", requesterSlackUserId: "UREQUESTER" }));
    expect(db.linkSlackIntakeToDeal).toHaveBeenCalledWith(101, 7);
    const message = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(message.blocks[1].fields[1].text).toBe("*Deal: Project Titan*");
    expect(message.blocks[3].text.text).toContain("*Business-facing response draft*\n*Answer*\n• We need to confirm consent.");
    expect(message.blocks[3].text.text).not.toContain("Lawyer judgement");
    expect(message.blocks[4].text.text).toContain("*Lawyer-only guidance — never posted to the business*");
    expect(message.blocks[4].text.text).toContain("Note: Lawyer judgement is required.");
    expect(db.updateSlackIntakeDraft).toHaveBeenCalledWith(101, expect.objectContaining({ response: expect.not.stringContaining("Lawyer judgement"), reviewer_notes: expect.stringContaining("Lawyer judgement") }));
  });
  it("rejects the other organisation's deal ID before intake, linking, AI or posting", async () => {
    const res = await call("/api/slack/interactions", submission("60002"));
    expect(res.json).toHaveBeenCalledWith({ response_action: "errors", errors: { deal_block: "Selected deal is not available to this Slack workspace." } });
    expect(db.getSlackWorkspaceDealById).toHaveBeenCalledWith(TEAM, 1, 60002);
    expectNoIntakeSideEffects();
  });
  it("rejects stale/archived/deleted/test/seed selections absent from the eligibility query", async () => {
    for (const id of ["30", "31", "32", "33"]) {
      const res = await call("/api/slack/interactions", submission(id));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ response_action: "errors" }));
    }
    expectNoIntakeSideEffects();
  });
  it("rejects an unconnected team even when no deal is selected", async () => {
    const res = await call("/api/slack/interactions", submission(null, "TUNKNOWN"));
    expect(res.json).toHaveBeenCalledWith({ response_action: "errors", errors: { deal_block: SLACK_NOT_CONNECTED } });
    expect(db.getSlackWorkspaceDealById).not.toHaveBeenCalled();
    expectNoIntakeSideEffects();
  });
  it("rejects metadata attempting to claim a different team", async () => {
    const payload = submissionPayload(); payload.team.id = "TUNKNOWN";
    const res = await call("/api/slack/interactions", signedRequest({ payload: JSON.stringify(payload) }));
    expect(res.json).toHaveBeenCalledWith({ response_action: "errors", errors: { deal_block: SLACK_NOT_CONNECTED } });
    expect(db.getSlackWorkspaceLink).not.toHaveBeenCalled();
    expectNoIntakeSideEffects();
  });
  it("rejects malformed selected IDs rather than silently making them unassigned", async () => {
    const res = await call("/api/slack/interactions", submission("7e0"));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ response_action: "errors" }));
    expectNoIntakeSideEffects();
  });
  it("rejects submission scope timeouts without creating an intake", async () => {
    vi.useFakeTimers();
    vi.mocked(db.getSlackWorkspaceLink).mockImplementation(() => new Promise(() => undefined));
    const pending = call("/api/slack/interactions", submission());
    await vi.advanceTimersByTimeAsync(2500);
    expect((await pending).json).toHaveBeenCalledWith(expect.objectContaining({ response_action: "errors" }));
    expectNoIntakeSideEffects();
  });
  it("keeps the optional deal unassigned within a verified workspace", async () => {
    await call("/api/slack/interactions", submission(null));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(db.linkSlackIntakeToDeal).not.toHaveBeenCalled();
    expect(db.getSlackWorkspaceDealById).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).blocks[1].fields[1].text).toBe("*Deal: needs assignment*");
  });
  it("will not post a draft or an approved cross-owner intake", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ status: "drafted", approvedResponse: "not approved" } as never);
    await expect(postApprovedSlackResponse(101)).rejects.toThrow("Approved Slack intake not found");
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ status: "approved", response: "approved", approvedResponse: "approved", teamId: TEAM, ownerUserId: 1, dealId: 60002 } as never);
    await expect(postApprovedSlackResponse(101)).rejects.toThrow("Selected deal is not available");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("posts exactly the approved business response without Clark or human review notes", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({
      status: "approved", response: "We will check the agreement before confirming the extension.",
      approvedResponse: "We will check the agreement before confirming the extension.",
      reviewerNotes: "Note: Lawyer judgement is required. Check the agreement and obtain consent.",
      reviewNote: "Internal human advice: do not promise an extension.",
      aiDraft: "Legacy combined text. Note: Lawyer judgement is required.",
      teamId: TEAM, ownerUserId: 1, dealId: 7, channelId: "business-channel", threadTs: "123.456",
    } as never);
    await postApprovedSlackResponse(101);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ channel: "business-channel", thread_ts: "123.456",
      text: "We will check the agreement before confirming the extension." });
    expect(db.markSlackIntakePosted).toHaveBeenCalledWith(101);
  });
  it("refuses legacy combined approved text until a separated response is explicitly reviewed", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ status: "approved", response: null,
      approvedResponse: "Answer. Note: Lawyer judgement is required.", teamId: TEAM, ownerUserId: 1 } as never);
    await expect(postApprovedSlackResponse(101)).rejects.toThrow("separated business-facing response");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.markSlackIntakePosted).not.toHaveBeenCalled();
  });
  it("refuses a mismatched response snapshot or lawyer-only guidance at the final posting boundary", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ status: "approved", response: "changed draft", approvedResponse: "approved draft" } as never);
    await expect(postApprovedSlackResponse(101)).rejects.toThrow("separated business-facing response");
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ status: "approved", response: "Note: Lawyer judgement is required.",
      approvedResponse: "Note: Lawyer judgement is required.", teamId: TEAM, ownerUserId: 1 } as never);
    await expect(postApprovedSlackResponse(101)).rejects.toThrow("Lawyer-only guidance cannot be posted");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires Clark's exact two-field JSON schema and separates both recorded dates", async () => {
    vi.mocked(db.getSlackWorkspaceDealById).mockResolvedValue({ id: 7, userId: 1, name: "Project Titan",
      closingDate: "2026-12-01 00:00:00", longstopDate: "2027-01-15 00:00:00" } as never);
    await call("/api/slack/interactions", submission());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const llm = vi.mocked(invokeLLM).mock.calls[0][0];
    expect(llm.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true,
      schema: { required: ["response", "reviewer_notes"], additionalProperties: false } } });
    expect(llm.messages[0].content).toContain('"target_closing_date":"2026-12-01"');
    expect(llm.messages[0].content).toContain('"long_stop_date":"2027-01-15"');
  });
  it("fails safely without a review card if Clark returns the old combined text", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: "Answer. Note: Lawyer judgement is required." } }] } as never);
    await call("/api/slack/interactions", submission());
    await vi.waitFor(() => expect(db.markSlackIntakeFailed).toHaveBeenCalled());
    expect(db.updateSlackIntakeDraft).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not send a target closing date presented as a missing long-stop date", async () => {
    vi.mocked(db.getSlackWorkspaceDealById).mockResolvedValue({ id: 7, userId: 1, name: "Project Titan",
      closingDate: "2026-12-01 00:00:00", longstopDate: null } as never);
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ status: "approved", response: "The long-stop date is 1 December 2026.",
      approvedResponse: "The long-stop date is 1 December 2026.", teamId: TEAM, ownerUserId: 1, dealId: 7 } as never);
    await expect(postApprovedSlackResponse(101)).rejects.toThrow("No long-stop date is recorded");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Slack raw form HTTP middleware", () => {
  it("verifies original form bytes including %20 and lowercase escapes", async () => {
    const raw = `payload=${encodeURIComponent(JSON.stringify(optionsPayload("Titan"))).replace(/%7B/g, "%7b")}&extra=one%20two`;
    const r = await realFetch(`${origin}/api/slack/options`, { method: "POST", headers: headersForRawBody(raw), body: raw });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ options: [{ text: { type: "plain_text", text: "Project Titan" }, value: "7" }] });
    expect(console.log).toHaveBeenCalledWith("[Slack options] arrived", expect.any(String));
  });
  it("rejects changed bytes even when the decoded form matches", async () => {
    const original = "payload=%7B%22value%22%3A%22Titan%22%7D&extra=one%20two";
    const r = await realFetch(`${origin}/api/slack/options`, { method: "POST", headers: headersForRawBody(original), body: original.replace("%20", "+") });
    expect(r.status).toBe(401);
    expect(db.getSlackWorkspaceLink).not.toHaveBeenCalled();
  });
  it("protects options diagnostics with signature verification", async () => {
    const r = await realFetch(`${origin}/api/slack/options/diagnostics`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "payload=%7B%7D" });
    expect(r.status).toBe(401);
  });
});
