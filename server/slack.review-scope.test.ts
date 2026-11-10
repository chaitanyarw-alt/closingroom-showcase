import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getSlackIntakeById: vi.fn(), getSlackWorkspaceLink: vi.fn(), getSlackWorkspaceDealById: vi.fn(),
  getDealById: vi.fn(), getDealAccessRole: vi.fn(), listSlackIntakes: vi.fn(),
  linkSlackIntakeToDeal: vi.fn(), approveSlackIntake: vi.fn(), rejectSlackIntake: vi.fn(), addAuditEntry: vi.fn(),
}));
vi.mock("./slack", () => ({ postApprovedSlackResponse: vi.fn() }));
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const TEAM = "T00000TEST0";
function caller(userId: number, role = "user") {
  return appRouter.createCaller({ user: { id: userId, role, name: "Lawyer" }, req: { headers: {} }, res: {} } as TrpcContext);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getSlackIntakeById).mockResolvedValue({ id: 101, teamId: TEAM, ownerUserId: 1, dealId: null, status: "drafted" } as never);
  vi.mocked(db.getSlackWorkspaceLink).mockResolvedValue({ teamId: TEAM, ownerUserId: 1 });
  vi.mocked(db.getDealById).mockResolvedValue({ id: 60002, userId: 60039, name: "Other account deal" } as never);
  vi.mocked(db.getDealAccessRole).mockResolvedValue("admin");
  vi.mocked(db.getSlackWorkspaceDealById).mockResolvedValue(undefined);
});

describe("Slack intake review ownership", () => {
  it("allows only the mapped owner to open an unassigned intake", async () => {
    await expect(caller(1).intake.get({ intakeId: 101 })).resolves.toMatchObject({ intake: { id: 101 } });
    await expect(caller(60039, "admin").intake.get({ intakeId: 101 })).rejects.toThrow("Only the linked account owner");
  });
  it("blocks cross-owner manual linking even when the reviewer is an admin member of that deal", async () => {
    await expect(caller(1).intake.linkDeal({ intakeId: 101, dealId: 60002 })).rejects.toThrow("outside this intake's workspace");
    expect(db.getSlackWorkspaceDealById).toHaveBeenCalledWith(TEAM, 1, 60002);
    expect(db.linkSlackIntakeToDeal).not.toHaveBeenCalled();
  });
  it("keeps existing deal-admin reviewer access for an eligible same-owner deal", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ id: 101, teamId: TEAM, ownerUserId: 1, dealId: 7, status: "drafted" } as never);
    vi.mocked(db.getDealById).mockResolvedValue({ id: 7, userId: 1, name: "Project Titan" } as never);
    vi.mocked(db.getSlackWorkspaceDealById).mockResolvedValue({ id: 7, userId: 1, name: "Project Titan" } as never);
    await expect(caller(2).intake.get({ intakeId: 101 })).resolves.toMatchObject({ deal: { id: 7 } });
    expect(db.getDealAccessRole).toHaveBeenCalledWith(7, 2, 1);
  });
  it("will not approve an intake whose linked deal is outside the mapped owner", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ id: 101, teamId: TEAM, ownerUserId: 1, dealId: 60002, status: "drafted" } as never);
    await expect(caller(1).intake.approve({ intakeId: 101, response: "Approved" })).rejects.toThrow("outside this intake's workspace");
    expect(db.approveSlackIntake).not.toHaveBeenCalled();
  });
  it("hides unassigned intake records from another account's global admin", async () => {
    const intake = { id: 101, teamId: TEAM, ownerUserId: 1, dealId: null };
    vi.mocked(db.listSlackIntakes).mockResolvedValue([intake] as never);
    await expect(caller(60039, "admin").intake.list()).resolves.toEqual([]);
    await expect(caller(1).intake.list()).resolves.toEqual([{ ...intake, dealName: null }]);
  });
  it("fails closed for legacy records without verified workspace attribution", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ id: 1, teamId: null, ownerUserId: null } as never);
    await expect(caller(1, "admin").intake.get({ intakeId: 1 })).rejects.toThrow("no verified workspace scope");
  });
  it("fails closed when the mapping is removed or re-pointed", async () => {
    vi.mocked(db.getSlackWorkspaceLink).mockResolvedValue({ teamId: TEAM, ownerUserId: 60039 });
    await expect(caller(1).intake.get({ intakeId: 101 })).rejects.toThrow("connection is unavailable");
    vi.mocked(db.getSlackWorkspaceLink).mockResolvedValue(undefined);
    await expect(caller(1).intake.get({ intakeId: 101 })).rejects.toThrow("connection is unavailable");
  });
  it("rejects the reported internal lawyer judgement text before saving an approval", async () => {
    await expect(caller(1).intake.approve({ intakeId: 101, response: "Answer. Note: Lawyer judgement is required." }))
      .rejects.toThrow("Lawyer-only guidance cannot be posted");
    expect(db.approveSlackIntake).not.toHaveBeenCalled();
  });
  it("passes only the business response to approval and stores the human review note separately", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ id: 101, teamId: TEAM, ownerUserId: 1, dealId: null,
      status: "drafted", response: "We will confirm consent before agreeing an extension.",
      reviewerNotes: "Note: Lawyer judgement is required. Review the signed agreement." } as never);
    await expect(caller(1).intake.approve({ intakeId: 101, response: " We will confirm consent before agreeing an extension. ",
      reviewNote: "Internal human advice: confirm client authority." })).resolves.toMatchObject({ success: true, posted: true });
    expect(db.approveSlackIntake).toHaveBeenCalledWith(101, 1, "We will confirm consent before agreeing an extension.",
      "Internal human advice: confirm client authority.");
  });
  it("rejects target closing date substitution before approval for a deal with no long-stop date", async () => {
    vi.mocked(db.getSlackIntakeById).mockResolvedValue({ id: 101, teamId: TEAM, ownerUserId: 1, dealId: 7, status: "drafted" } as never);
    vi.mocked(db.getDealById).mockResolvedValue({ id: 7, userId: 1, name: "Project Titan" } as never);
    vi.mocked(db.getSlackWorkspaceDealById).mockResolvedValue({ id: 7, userId: 1, name: "Project Titan",
      closingDate: "2026-12-01 00:00:00", longstopDate: null } as never);
    await expect(caller(1).intake.approve({ intakeId: 101, response: "The long-stop date is 1 December 2026." }))
      .rejects.toThrow("No long-stop date is recorded");
    expect(db.approveSlackIntake).not.toHaveBeenCalled();
  });
});
