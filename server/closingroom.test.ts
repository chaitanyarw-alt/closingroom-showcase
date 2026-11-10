import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDealsForUser: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Acme Acquisition", description: null, closingDate: null, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getDealById: vi.fn().mockResolvedValue({
    id: 1, userId: 1, name: "Acme Acquisition", description: null, closingDate: null, createdAt: new Date(), updatedAt: new Date(),
  }),
  createDeal: vi.fn().mockResolvedValue(42),
  updateDeal: vi.fn().mockResolvedValue(undefined),
  deleteDeal: vi.fn().mockResolvedValue(undefined),
  getChecklistItems: vi.fn().mockResolvedValue([
    { id: 10, dealId: 1, section: "conditions_precedent", title: "Board approval", status: "Under Review", notes: null, deadline: null, assigneeUserId: null, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: 11, dealId: 1, section: "transaction_documents", title: "SPA executed", status: "Executed", notes: null, deadline: null, assigneeUserId: null, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  ]),
  updateItemStatus: vi.fn().mockResolvedValue(undefined),
  updateItemNotes: vi.fn().mockResolvedValue(undefined),
  updateItemDeadline: vi.fn().mockResolvedValue(undefined),
  createChecklistItem: vi.fn().mockResolvedValue(20),
  seedDefaultChecklistItems: vi.fn().mockResolvedValue(undefined),
  getChatHistory: vi.fn().mockResolvedValue([
    { id: 1, dealId: 1, role: "user", content: "What is outstanding?", createdAt: new Date() },
    { id: 2, dealId: 1, role: "assistant", content: "Board approval is still pending.", createdAt: new Date() },
  ]),
  saveChatMessage: vi.fn().mockResolvedValue(undefined),
  getAuditLog: vi.fn().mockResolvedValue([
    { id: 1, dealId: 1, userId: 1, userName: "Test Lawyer", action: "status_changed", itemId: 10, fromValue: "Under Review", toValue: "Executed", metadata: "Board approval", createdAt: new Date() },
  ]),
  addAuditEntry: vi.fn().mockResolvedValue(undefined),
  getDocuments: vi.fn().mockResolvedValue([]),
  createDocument: vi.fn().mockResolvedValue(5),
  updateDocumentExtraction: vi.fn().mockResolvedValue(undefined),
  updateDocumentStorageKey: vi.fn().mockResolvedValue(undefined),
  deleteDocument: vi.fn().mockResolvedValue(undefined),
  getDealMembers: vi.fn().mockResolvedValue([]),
  getDealMember: vi.fn().mockResolvedValue(null),
  getDealMemberByToken: vi.fn().mockResolvedValue(null),
  getDealMemberByEmail: vi.fn().mockResolvedValue(null),
  getDealAccessRole: vi.fn().mockResolvedValue("owner"),
  createDealInvite: vi.fn().mockResolvedValue(undefined),
  acceptDealInvite: vi.fn().mockResolvedValue(undefined),
  removeDealMember: vi.fn().mockResolvedValue(undefined),
  updateDealMemberRole: vi.fn().mockResolvedValue(undefined),
  touchDealMemberAccess: vi.fn().mockResolvedValue(undefined),
  getSignaturePages: vi.fn().mockResolvedValue([]),
  createSignaturePage: vi.fn().mockResolvedValue(7),
  updateSignatureStatus: vi.fn().mockResolvedValue(undefined),
  markDealAsViewed: vi.fn().mockResolvedValue(undefined),
  getAllDealsForDashboard: vi.fn().mockResolvedValue([]),
  getUserByOpenId: vi.fn().mockResolvedValue(null),
  updateItemTitle: vi.fn().mockResolvedValue(undefined),
  updateItemParty: vi.fn().mockResolvedValue(undefined),
  deleteChecklistItem: vi.fn().mockResolvedValue(undefined),
  linkDocumentToItem: vi.fn().mockResolvedValue(undefined),
  getDocumentsByItem: vi.fn().mockResolvedValue([]),
  getConversationThreads: vi.fn().mockResolvedValue([]),
  createConversationThread: vi.fn().mockResolvedValue(1),
  updateConversationThreadTitle: vi.fn().mockResolvedValue(undefined),
  deleteConversationThread: vi.fn().mockResolvedValue(undefined),
  getConversationMessages: vi.fn().mockResolvedValue([]),
  saveConversationMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Board approval is still outstanding." } }],
  }),
}));

// ─── Context factory ──────────────────────────────────────────────────────────

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "lawyer@firm.com",
      name: "Test Lawyer",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Deals ────────────────────────────────────────────────────────────────────

describe("deals.list", () => {
  it("returns deals for the authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.deals.list();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Acme Acquisition");
  });
});

describe("deals.get", () => {
  it("returns deal with checklist items", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.deals.get({ dealId: 1 });
    expect(result.deal.name).toBe("Acme Acquisition");
    expect(result.items).toHaveLength(2);
  });
});

describe("deals.create", () => {
  it("creates a deal and returns dealId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.deals.create({ name: "New Deal" });
    expect(result.dealId).toBe(42);
  });
});

describe("deals.update", () => {
  it("updates a deal name successfully", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.deals.update({ dealId: 1, name: "Renamed Deal" });
    expect(result.success).toBe(true);
  });

  it("rejects empty deal name", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.deals.update({ dealId: 1, name: "" })
    ).rejects.toThrow();
  });
});

describe("deals.delete", () => {
  it("deletes a deal successfully", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.deals.delete({ dealId: 1 });
    expect(result.success).toBe(true);
  });
});

// ─── Checklist Items ──────────────────────────────────────────────────────────

describe("items.updateStatus", () => {
  it("updates item status successfully", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.items.updateStatus({
      itemId: 10,
      dealId: 1,
      status: "Executed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status values", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.items.updateStatus({
        itemId: 10,
        dealId: 1,
        status: "InvalidStatus" as "Executed",
      })
    ).rejects.toThrow();
  });
});

describe("items.updateNotes", () => {
  it("updates item notes successfully", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.items.updateNotes({
      itemId: 10,
      dealId: 1,
      notes: "Awaiting board resolution",
    });
    expect(result.success).toBe(true);
  });
});

describe("items.create", () => {
  it("creates a new checklist item", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.items.create({
      dealId: 1,
      section: "conditions_precedent",
      title: "Custom CP item",
    });
    expect(result.itemId).toBe(20);
  });

  it("rejects empty title", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.items.create({ dealId: 1, section: "conditions_precedent", title: "" })
    ).rejects.toThrow();
  });
});

describe("items.setDeadline", () => {
  it("sets a deadline on a checklist item", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.items.setDeadline({
      itemId: 10,
      dealId: 1,
      deadline: "2025-12-31",
      assigneeUserId: null,
    });
    expect(result.success).toBe(true);
  });

  it("clears a deadline when null is passed", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.items.setDeadline({
      itemId: 10,
      dealId: 1,
      deadline: null,
      assigneeUserId: null,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Chat ─────────────────────────────────────────────────────────────────────

describe("chat.history", () => {
  it("returns chat history for a deal", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.history({ dealId: 1 });
    expect(result).toHaveLength(2);
    expect(result[0]?.role).toBe("user");
    expect(result[1]?.role).toBe("assistant");
  });
});

describe("chat.send", () => {
  it("sends a message and returns AI reply", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({
      dealId: 1,
      message: "What is still outstanding?",
    });
    expect(result.reply).toBe("Board approval is still outstanding.");
  });

  it("rejects empty messages", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.chat.send({ dealId: 1, message: "" })
    ).rejects.toThrow();
  });
});

// ─── Audit ────────────────────────────────────────────────────────────────────

describe("audit.list", () => {
  it("returns audit log entries for a deal", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.audit.list({ dealId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]?.action).toBe("status_changed");
  });
});

// ─── Alerts ───────────────────────────────────────────────────────────────────

describe("alerts.getOverdueSummary", () => {
  it("returns zero counts when no deadlines are set", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.alerts.getOverdueSummary({ dealId: 1 });
    expect(result.overdueCount).toBe(0);
    expect(result.approachingCount).toBe(0);
    expect(result.dealClosingOverdue).toBe(false);
  });
});

// ─── Signatures ───────────────────────────────────────────────────────────────

describe("signatures.list", () => {
  it("returns empty array when no signatures exist", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.signatures.list({ dealId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

// ─── Party Summary ────────────────────────────────────────────────────────────

describe("chat.send — party_summary intent", () => {
  it("returns AI reply when intent detection returns party_summary", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const mockInvoke = vi.mocked(invokeLLM);

    // First call: intent detection returns party_summary
    // Second call: main LLM response
    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "party_summary",
                matchedItemIds: [],
                newStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: "BlackStone Ridge",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "BlackStone Ridge has 1 item remaining: Board approval [Under Review]." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({
      dealId: 1,
      message: "What does BlackStone Ridge still need to do?",
    });

    expect(result.reply).toContain("BlackStone Ridge");
    // Restore default mock for subsequent tests
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("falls back gracefully when intent detection fails to parse", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const mockInvoke = vi.mocked(invokeLLM);

    // First call: intent detection returns malformed JSON
    // Second call: main LLM response
    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: "not valid json" } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "General answer about the deal." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({
      dealId: 1,
      message: "What does BlackStone Ridge still need to do?",
    });

    expect(result.reply).toBeTruthy();
    // Restore default mock
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

// ─── Item Status Query ────────────────────────────────────────────────────────

describe("chat.send — item_status_query intent", () => {
  it("returns AI reply with item details when intent is item_status_query", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const mockInvoke = vi.mocked(invokeLLM);

    // First call: intent detection returns item_status_query for item id 10
    // Second call: main LLM response
    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "item_status_query",
                matchedItemIds: [10],
                newStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Board approval is currently Under Review." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({
      dealId: 1,
      message: "What is the status of the Board approval?",
    });

    expect(result.reply).toContain("Board approval");
    // Restore default mock
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("does not perform a status change when intent is item_status_query", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { updateItemStatus } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockUpdate = vi.mocked(updateItemStatus);
    mockUpdate.mockClear();

    // Intent detection returns item_status_query — NOT status_change
    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "item_status_query",
                matchedItemIds: [10],
                newStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Board approval is currently Under Review." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.send({
      dealId: 1,
      message: "What is the status of the Board approval?",
    });

    // updateItemStatus must NOT have been called
    expect(mockUpdate).not.toHaveBeenCalled();

    // Restore default mock
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

// ─── Status Filter Query ──────────────────────────────────────────────────────

describe("chat.send — status_filter_query intent", () => {
  it("returns AI reply listing items with the requested status", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const mockInvoke = vi.mocked(invokeLLM);

    // First call: intent detection returns status_filter_query for "Under Review"
    // Second call: main LLM response
    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "status_filter_query",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: "Under Review",
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "The following items are currently Under Review: Board approval [Conditions Precedent]." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({
      dealId: 1,
      message: "Show me all items that are currently Under Review.",
    });

    expect(result.reply).toContain("Under Review");
    // Restore default mock
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("does not perform a status change when intent is status_filter_query", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { updateItemStatus } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockUpdate = vi.mocked(updateItemStatus);
    mockUpdate.mockClear();

    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "status_filter_query",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: "Executed",
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "The following items are Executed: SPA executed." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.send({
      dealId: 1,
      message: "List all executed items.",
    });

    expect(mockUpdate).not.toHaveBeenCalled();

    // Restore default mock
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

// ─── Item Duration Query ──────────────────────────────────────────────────────

describe("chat.send — item_duration_query intent", () => {
  it("returns AI reply with duration and date when intent is item_duration_query", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getChecklistItems } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetItems = vi.mocked(getChecklistItems);

    // Provide an item with a statusChangedAt timestamp 8 days ago
    const eightDaysAgo = Date.now() - 8 * 86400000;
    mockGetItems.mockResolvedValue([
      {
        id: 10,
        title: "Management warranties deed",
        section: "conditions_precedent",
        status: "Under Review",
        statusChangedAt: eightDaysAgo,
        party: "buyer",
        partyLabel: "BlackStone Ridge",
        partyCustom: null,
        partiesJson: null,
        notes: null,
        deadline: null,
        sortOrder: 0,
        dealId: 1,
        createdAt: eightDaysAgo,
      } as any,
    ]);

    // First call: intent detection returns item_duration_query for item 10
    // Second call: main LLM response
    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "item_duration_query",
                matchedItemIds: [10],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: null,
                durationFilterStatus: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Management warranties deed has been Under Review for 8 days since 17 April 2026." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({
      dealId: 1,
      message: "How long has the management warranties deed been under review?",
    });

    expect(result.reply).toContain("Management warranties deed");
    expect(result.statusUpdate).toBeNull();

    // Restore default mocks
    mockGetItems.mockResolvedValue([
      { id: 10, title: "Board approval", section: "conditions_precedent", status: "Under Review", statusChangedAt: null, party: "buyer", partyLabel: null, partyCustom: null, partiesJson: null, notes: null, deadline: null, sortOrder: 0, dealId: 1, createdAt: Date.now() } as any,
      { id: 11, title: "SPA executed", section: "transaction_documents", status: "Executed", statusChangedAt: null, party: "buyer", partyLabel: null, partyCustom: null, partiesJson: null, notes: null, deadline: null, sortOrder: 1, dealId: 1, createdAt: Date.now() } as any,
    ]);
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("does not perform a status change when intent is item_duration_query", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { updateItemStatus } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockUpdate = vi.mocked(updateItemStatus);
    mockUpdate.mockClear();

    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "item_duration_query",
                matchedItemIds: [10],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: null,
                durationFilterStatus: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Board approval has been Under Review for 5 days since 20 April 2026." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.send({ dealId: 1, message: "How long has the board approval been outstanding?" });

    expect(mockUpdate).not.toHaveBeenCalled();

    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

// ─── Duration Threshold Query ─────────────────────────────────────────────────

describe("chat.send — duration_threshold_query intent", () => {
  it("returns AI reply listing items exceeding the threshold", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getChecklistItems } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetItems = vi.mocked(getChecklistItems);

    // Item 10 has been Outstanding for 5 days — exceeds threshold of 3
    const fiveDaysAgo = Date.now() - 5 * 86400000;
    mockGetItems.mockResolvedValue([
      {
        id: 10,
        title: "Board approval",
        section: "conditions_precedent",
        status: "Outstanding",
        statusChangedAt: fiveDaysAgo,
        party: "buyer",
        partyLabel: "BlackStone Ridge",
        partyCustom: null,
        partiesJson: null,
        notes: null,
        deadline: null,
        sortOrder: 0,
        dealId: 1,
        createdAt: fiveDaysAgo,
      } as any,
      {
        id: 11,
        title: "SPA executed",
        section: "transaction_documents",
        status: "Executed",
        statusChangedAt: Date.now() - 86400000,
        party: "buyer",
        partyLabel: null,
        partyCustom: null,
        partiesJson: null,
        notes: null,
        deadline: null,
        sortOrder: 1,
        dealId: 1,
        createdAt: Date.now(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "duration_threshold_query",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: 3,
                durationFilterStatus: "Outstanding",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Board approval has been Outstanding for 5 days since 20 April 2026." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({
      dealId: 1,
      message: "Which items have been outstanding for more than 3 days?",
    });

    expect(result.reply).toContain("Board approval");
    expect(result.statusUpdate).toBeNull();

    // Restore default mocks
    mockGetItems.mockResolvedValue([
      { id: 10, title: "Board approval", section: "conditions_precedent", status: "Under Review", statusChangedAt: null, party: "buyer", partyLabel: null, partyCustom: null, partiesJson: null, notes: null, deadline: null, sortOrder: 0, dealId: 1, createdAt: Date.now() } as any,
      { id: 11, title: "SPA executed", section: "transaction_documents", status: "Executed", statusChangedAt: null, party: "buyer", partyLabel: null, partyCustom: null, partiesJson: null, notes: null, deadline: null, sortOrder: 1, dealId: 1, createdAt: Date.now() } as any,
    ]);
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("does not perform a status change when intent is duration_threshold_query", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { updateItemStatus } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockUpdate = vi.mocked(updateItemStatus);
    mockUpdate.mockClear();

    mockInvoke
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "duration_threshold_query",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: 7,
                durationFilterStatus: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "The following items have been in their current status for more than 7 days." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.send({ dealId: 1, message: "Which items have been in their status for more than a week?" });

    expect(mockUpdate).not.toHaveBeenCalled();

    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

describe("chat.send — email_draft intent", () => {
  it("returns a draft email for the named party and does not call updateItemStatus", async () => {
    const { invokeLLM: mockInvoke } = await import("./_core/llm");
    const { updateItemStatus: mockUpdate } = await import("./db");
    const mockInvokeFn = mockInvoke as ReturnType<typeof vi.fn>;
    const mockUpdateFn = mockUpdate as ReturnType<typeof vi.fn>;
    mockInvokeFn.mockReset();
    mockUpdateFn.mockReset();

    mockInvokeFn
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "email_draft",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: null,
                durationFilterStatus: null,
                emailPartyName: "BlackStone Ridge",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "DRAFT EMAIL\n\nSubject: Acme Acquisition — Outstanding Items for Attention\n\nDear BlackStone Ridge,\n\nI write in connection with the above transaction..." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Draft a chaser email to BlackStone Ridge about their outstanding items" });

    expect(result.reply).toContain("DRAFT EMAIL");
    expect(result.statusUpdate).toBeNull();
    expect(mockUpdateFn).not.toHaveBeenCalled();

    mockInvokeFn.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("does not draft an email when emailPartyName is null (falls through to none)", async () => {
    const { invokeLLM: mockInvoke } = await import("./_core/llm");
    const mockInvokeFn = mockInvoke as ReturnType<typeof vi.fn>;
    mockInvokeFn.mockReset();

    mockInvokeFn
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "email_draft",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: null,
                durationFilterStatus: null,
                emailPartyName: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "General response without email draft." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Draft an email" });

    // Falls through to general response — no email draft label required
    expect(result.reply).toBeTruthy();
    expect(result.statusUpdate).toBeNull();

    mockInvokeFn.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

describe("chat.send — deal narrative in system prompt", () => {
  it("includes deal metadata in the system prompt when deal has full metadata", async () => {
    const { invokeLLM: mockInvoke } = await import("./_core/llm");
    const { getDealById: mockGetDeal } = await import("./db");
    const mockInvokeFn = mockInvoke as ReturnType<typeof vi.fn>;
    const mockGetDealFn = mockGetDeal as ReturnType<typeof vi.fn>;
    mockInvokeFn.mockReset();
    mockGetDealFn.mockReset();

    mockGetDealFn.mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Project Titan",
      description: null,
      closingDate: new Date("2026-08-01").getTime(),
      createdAt: new Date(),
      updatedAt: new Date(),
      targetCompany: "Meridian Logistics Ltd",
      dealStructure: "Share Purchase",
      dealStructureOther: null,
      dealValue: "£240 million",
      governingLaw: "English law",
      buyerName: "BlackStone Ridge Capital LLP",
      sellerName: "Meridian Holdings Group plc",
      buyerCounsel: "Slaughter and May",
      sellerCounsel: "Freshfields",
    });

    mockInvokeFn
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "none", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Project Titan is a £240 million Share Purchase of Meridian Logistics Ltd by BlackStone Ridge Capital LLP from Meridian Holdings Group plc, governed by English law." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Give me a full status update on the deal." });

    // The second invokeLLM call receives the system prompt — verify the deal metadata was injected
    const secondCallArgs = mockInvokeFn.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("Meridian Logistics Ltd");
    expect(systemMsg?.content).toContain("BlackStone Ridge Capital LLP");
    expect(systemMsg?.content).toContain("£240 million");
    expect(result.reply).toBeTruthy();

    // Restore default mock
    mockGetDealFn.mockResolvedValue({
      id: 1, userId: 1, name: "Acme Acquisition", description: null, closingDate: null, createdAt: new Date(), updatedAt: new Date(),
    });
    mockInvokeFn.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

describe("chat.send — email_draft selective items (emailItemTitles)", () => {
  it("uses only the specified items when emailItemTitles is provided", async () => {
    const { invokeLLM: mockInvoke } = await import("./_core/llm");
    const { updateItemStatus: mockUpdate } = await import("./db");
    const mockInvokeFn = mockInvoke as ReturnType<typeof vi.fn>;
    const mockUpdateFn = mockUpdate as ReturnType<typeof vi.fn>;
    mockInvokeFn.mockReset();
    mockUpdateFn.mockReset();

    // Return email_draft intent with specific item titles
    mockInvokeFn
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "email_draft",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: null,
                durationFilterStatus: null,
                emailPartyName: "BlackStone Ridge",
                emailItemTitles: ["Board approval"],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "DRAFT EMAIL\n\nSubject: Acme Acquisition — Outstanding Items for Attention\n\nDear BlackStone Ridge,\n\nI write regarding the Board approval item only..." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Draft a chaser to BlackStone Ridge about the Board approval only" });

    expect(result.reply).toContain("DRAFT EMAIL");
    expect(result.statusUpdate).toBeNull();
    expect(mockUpdateFn).not.toHaveBeenCalled();

    // The second LLM call should include the scope note about specific items
    const secondCallArgs = mockInvokeFn.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("Board approval");

    mockInvokeFn.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("flags unmatched item titles in the email draft context", async () => {
    const { invokeLLM: mockInvoke } = await import("./_core/llm");
    const mockInvokeFn = mockInvoke as ReturnType<typeof vi.fn>;
    mockInvokeFn.mockReset();

    // Request an item that does not exist on the checklist
    mockInvokeFn
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "email_draft",
                matchedItemIds: [],
                newStatus: null,
                filterStatus: null,
                candidateItems: [],
                notFoundReference: null,
                partyName: null,
                durationThresholdDays: null,
                durationFilterStatus: null,
                emailPartyName: "BlackStone Ridge",
                emailItemTitles: ["Non-existent item XYZ"],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "DRAFT EMAIL\n\nNote: The item 'Non-existent item XYZ' could not be matched on the checklist." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Draft a chaser to BlackStone Ridge about the Non-existent item XYZ" });

    expect(result.reply).toContain("DRAFT EMAIL");
    // The system prompt should contain the unmatched note
    const secondCallArgs = mockInvokeFn.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("Non-existent item XYZ");

    mockInvokeFn.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

// ─── PDF Document Reading Feature ────────────────────────────────────────────

describe("documents.confirmUpload — PDF extraction and chat acknowledgement", () => {
  it("saves extracted text and posts a neutral acknowledgement chat message", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { updateDocumentExtraction, saveChatMessage, addAuditEntry } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockExtract = vi.mocked(updateDocumentExtraction);
    const mockSaveChat = vi.mocked(saveChatMessage);
    const mockAudit = vi.mocked(addAuditEntry);

    mockInvoke.mockResolvedValueOnce({
      choices: [{ message: { content: "This document is a CMA clearance letter dated 15 April 2026 confirming merger clearance has been granted to Acme Corp." } }],
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.documents.confirmUpload({
      docId: 5,
      dealId: 1,
      storageKey: "deals/1/docs/cma-clearance.pdf",
      fileContent: Buffer.from("fake pdf content").toString("base64"),
      filename: "cma-clearance.pdf",
    });

    // extractedText should be saved
    expect(mockExtract).toHaveBeenCalledWith(5, expect.stringContaining("CMA clearance"));

    // Neutral acknowledgement should be saved as assistant chat message
    expect(mockSaveChat).toHaveBeenCalledWith(
      1,
      "assistant",
      expect.stringContaining("Document received")
    );
    expect(mockSaveChat).toHaveBeenCalledWith(
      1,
      "assistant",
      expect.stringContaining("cma-clearance.pdf")
    );

    // Audit entry should be added
    expect(mockAudit).toHaveBeenCalledWith(1, 1, "Test Lawyer", "document_uploaded", expect.anything());

    // Returns extractedText
    expect(result.extractedText).toBeTruthy();
  });

  it("uses 'document' as fallback filename when filename is not provided", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { saveChatMessage } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockSaveChat = vi.mocked(saveChatMessage);

    mockInvoke.mockResolvedValueOnce({
      choices: [{ message: { content: "Document text extracted." } }],
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.documents.confirmUpload({
      docId: 5,
      dealId: 1,
      storageKey: "deals/1/docs/unnamed.pdf",
      fileContent: Buffer.from("fake pdf content").toString("base64"),
    });

    // Fallback filename should be used
    expect(mockSaveChat).toHaveBeenCalledWith(
      1,
      "assistant",
      expect.stringContaining("document")
    );
  });
});

describe("chat.send — document context injected into system prompt", () => {
  it("injects processed document extracted text into the system prompt", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValueOnce([
      {
        id: 1,
        dealId: 1,
        uploadedByUserId: 1,
        filename: "cma-clearance.pdf",
        storageKey: "deals/1/docs/cma-clearance.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        extractedText: "This is a CMA clearance letter confirming merger clearance has been granted to Acme Corp on 15 April 2026.",
        aiProcessed: true,
        createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "none", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "The CMA clearance letter confirms merger clearance was granted on 15 April 2026." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "What does the CMA clearance letter say?" });

    // The second LLM call system prompt should contain the document text
    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("UPLOADED DOCUMENTS");
    expect(systemMsg?.content).toContain("cma-clearance.pdf");
    expect(systemMsg?.content).toContain("CMA clearance letter");
    expect(systemMsg?.content).toContain("DOCUMENT READING RULES");
    expect(result.reply).toContain("CMA clearance");

    // Restore default mock
    mockGetDocs.mockResolvedValue([]);
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });

  it("does not inject document context when no documents are processed", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    // No processed documents
    mockGetDocs.mockResolvedValue([]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "none", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "No documents have been uploaded." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.send({ dealId: 1, message: "What documents have been uploaded?" });

    // The second LLM call system prompt should NOT contain the UPLOADED DOCUMENTS section
    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).not.toContain("UPLOADED DOCUMENTS");
    // But DOCUMENT READING RULES should still be present
    expect(systemMsg?.content).toContain("DOCUMENT READING RULES");

    // Restore default mock
    mockGetDocs.mockResolvedValue([]);
    mockInvoke.mockResolvedValue({
      choices: [{ message: { content: "Board approval is still outstanding." } }],
    });
  });
});

describe("chat.send — document_summary intent", () => {
  it("injects DOCUMENT SUMMARY REQUEST with extracted text when a specific document is named", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1,
        dealId: 1,
        uploadedByUserId: 1,
        filename: "cma-clearance.pdf",
        storageKey: "deals/1/docs/cma-clearance.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        extractedText: "This letter confirms that CMA merger clearance has been granted to Acme Corp on 15 April 2026.",
        aiProcessed: true,
        createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_summary", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: "cma-clearance" }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "The CMA clearance letter confirms merger clearance was granted to Acme Corp on 15 April 2026. Please review the document yourself before updating any checklist item status." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Summarise the CMA clearance letter" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT SUMMARY REQUEST");
    expect(systemMsg?.content).toContain("cma-clearance.pdf");
    expect(systemMsg?.content).toContain("CMA merger clearance has been granted");
    expect(systemMsg?.content).toContain("DOCUMENT SUMMARY RULE");
    expect(result.reply).toContain("CMA clearance");
  });

  it("asks for clarification when no document is named and multiple documents are uploaded", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1, dealId: 1, uploadedByUserId: 1, filename: "cma-clearance.pdf", storageKey: "k1",
        mimeType: "application/pdf", sizeBytes: 512, extractedText: "CMA clearance text.", aiProcessed: true, createdAt: new Date(),
      } as any,
      {
        id: 2, dealId: 1, uploadedByUserId: 1, filename: "board-consent.pdf", storageKey: "k2",
        mimeType: "application/pdf", sizeBytes: 512, extractedText: "Board consent text.", aiProcessed: true, createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_summary", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Multiple documents are available. Please specify which one you would like summarised: 1. cma-clearance.pdf, 2. board-consent.pdf." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Summarise the document" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT SUMMARY REQUEST");
    expect(systemMsg?.content).toContain("cma-clearance.pdf");
    expect(systemMsg?.content).toContain("board-consent.pdf");
    expect(systemMsg?.content).toContain("Ask the lawyer to specify which document");
    expect(result.reply).toBeTruthy();
  });

  it("informs the lawyer when no documents have been uploaded", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_summary", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "No documents have been uploaded to this deal yet. Please upload a document to the relevant checklist item." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Summarise the uploaded document" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT SUMMARY REQUEST");
    expect(systemMsg?.content).toContain("no documents have been uploaded and processed");
    expect(result.reply).toBeTruthy();
  });
});

describe("chat.send — document_question intent (follow-up questions)", () => {
  it("injects DOCUMENT QUESTION block with extracted text when a specific question is asked about a named document", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1,
        dealId: 1,
        uploadedByUserId: 1,
        filename: "cma-clearance.pdf",
        storageKey: "deals/1/docs/cma-clearance.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        extractedText: "This letter confirms that CMA merger clearance has been granted to Acme Corp on 15 April 2026. The clearance was granted by the Competition and Markets Authority. Parties: Acme Corp (buyer) and Zeta Holdings Ltd (seller).",
        aiProcessed: true,
        createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_question", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: "cma-clearance" }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "The parties named in the document are Acme Corp (buyer) and Zeta Holdings Ltd (seller). Please review the document yourself before updating any checklist item status." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Who are the parties named in this document?" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT QUESTION");
    expect(systemMsg?.content).toContain("cma-clearance.pdf");
    expect(systemMsg?.content).toContain("CMA merger clearance has been granted");
    expect(systemMsg?.content).toContain("DOCUMENT QUESTION RULE");
    expect(result.reply).toContain("Acme Corp");
  });

  it("uses the single available document when no filename is specified in a follow-up question", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1, dealId: 1, uploadedByUserId: 1, filename: "board-consent.pdf", storageKey: "k1",
        mimeType: "application/pdf", sizeBytes: 512,
        extractedText: "Board consent signed on 10 April 2026. Effective date: 10 April 2026.",
        aiProcessed: true, createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_question", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "The effective date is 10 April 2026. Please review the document yourself before updating any checklist item status." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "What is the effective date?" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT QUESTION");
    expect(systemMsg?.content).toContain("board-consent.pdf");
    expect(systemMsg?.content).toContain("Board consent signed on 10 April 2026");
    expect(result.reply).toContain("10 April 2026");
  });

  it("asks for clarification when no filename is specified and multiple documents are uploaded", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1, dealId: 1, uploadedByUserId: 1, filename: "cma-clearance.pdf", storageKey: "k1",
        mimeType: "application/pdf", sizeBytes: 512, extractedText: "CMA clearance text.", aiProcessed: true, createdAt: new Date(),
      } as any,
      {
        id: 2, dealId: 1, uploadedByUserId: 1, filename: "board-consent.pdf", storageKey: "k2",
        mimeType: "application/pdf", sizeBytes: 512, extractedText: "Board consent text.", aiProcessed: true, createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_question", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Multiple documents are available. Please specify which one your question refers to: 1. cma-clearance.pdf, 2. board-consent.pdf." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "What date was it signed?" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT QUESTION");
    expect(systemMsg?.content).toContain("cma-clearance.pdf");
    expect(systemMsg?.content).toContain("board-consent.pdf");
    expect(systemMsg?.content).toContain("Ask the lawyer to clarify which document");
    expect(result.reply).toBeTruthy();
  });

  it("informs the lawyer when no documents have been uploaded and they ask a follow-up question", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_question", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "No documents have been uploaded to this deal yet. Please upload a document to the relevant checklist item." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Does it confirm clearance?" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT QUESTION");
    expect(systemMsg?.content).toContain("no documents have been uploaded and processed");
    expect(result.reply).toBeTruthy();
  });
});

describe("chat.send — document_defined_terms intent (extract defined terms)", () => {
  it("injects DOCUMENT DEFINED TERMS REQUEST block with extracted text when lawyer asks to extract defined terms from a named document", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1,
        dealId: 1,
        uploadedByUserId: 1,
        filename: "share-purchase-agreement.pdf",
        storageKey: "deals/1/docs/spa.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        extractedText: `DEFINITIONS\n"Buyer" means BlackStone Ridge Capital LLP, a limited liability partnership incorporated in England and Wales.\n"Seller" means Meridian Holdings Group plc, a public limited company incorporated in England and Wales.\n"Completion Date" means the date on which Completion occurs pursuant to clause 5.\n"Purchase Price" means the aggregate consideration payable by the Buyer to the Seller as set out in clause 3.`,
        aiProcessed: true,
        createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_defined_terms", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: "share-purchase-agreement" }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "**Buyer** means BlackStone Ridge Capital LLP...\n**Completion Date** means the date on which Completion occurs...\n**Purchase Price** means the aggregate consideration...\n**Seller** means Meridian Holdings Group plc...\n\nPlease review the document yourself before updating any checklist item status." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Extract all defined terms from the SPA" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT DEFINED TERMS REQUEST");
    expect(systemMsg?.content).toContain("share-purchase-agreement.pdf");
    expect(systemMsg?.content).toContain("DEFINITIONS");
    expect(systemMsg?.content).toContain("DOCUMENT DEFINED TERMS RULE");
    expect(result.reply).toContain("Buyer");
  });

  it("uses the single available document when no filename is specified", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1, dealId: 1, uploadedByUserId: 1, filename: "cma-clearance.pdf", storageKey: "k1",
        mimeType: "application/pdf", sizeBytes: 512,
        extractedText: `"Clearance" means the written decision issued by the CMA dated 15 April 2026 confirming that the Merger may proceed.`,
        aiProcessed: true, createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_defined_terms", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "**Clearance** means the written decision issued by the CMA dated 15 April 2026 confirming that the Merger may proceed.\n\nPlease review the document yourself before updating any checklist item status." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "List the definitions in this document" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT DEFINED TERMS REQUEST");
    expect(systemMsg?.content).toContain("cma-clearance.pdf");
    expect(result.reply).toContain("Clearance");
  });

  it("informs the lawyer when no documents have been uploaded", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_defined_terms", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "No documents have been uploaded to this deal yet. Please upload a document to the relevant checklist item." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Extract all defined terms" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT DEFINED TERMS REQUEST");
    expect(systemMsg?.content).toContain("no documents have been uploaded and processed");
    expect(result.reply).toBeTruthy();
  });
});

describe("chat.send — document_party_obligations intent (identify party obligations)", () => {
  it("injects DOCUMENT PARTY OBLIGATIONS REQUEST block with extracted text when lawyer asks about all parties", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1,
        dealId: 1,
        uploadedByUserId: 1,
        filename: "share-purchase-agreement.pdf",
        storageKey: "deals/1/docs/spa.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        extractedText: `The Buyer shall pay the Purchase Price on the Completion Date. The Seller shall deliver the Sale Shares free from all encumbrances. The Buyer may terminate this Agreement if the Conditions are not satisfied by the Longstop Date. The Seller is responsible for obtaining all necessary regulatory consents prior to Completion.`,
        aiProcessed: true,
        createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_party_obligations", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: "share-purchase-agreement" }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "**BUYER**\nObligations: Shall pay the Purchase Price on the Completion Date.\nRights: May terminate this Agreement if the Conditions are not satisfied by the Longstop Date.\nResponsibilities: None explicitly stated.\n\n**SELLER**\nObligations: Shall deliver the Sale Shares free from all encumbrances.\nRights: None explicitly stated.\nResponsibilities: Is responsible for obtaining all necessary regulatory consents prior to Completion.\n\nPlease review the document yourself before updating any checklist item status." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "What are the obligations of each party in the SPA?" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT PARTY OBLIGATIONS REQUEST");
    expect(systemMsg?.content).toContain("share-purchase-agreement.pdf");
    expect(systemMsg?.content).toContain("Buyer shall pay the Purchase Price");
    expect(systemMsg?.content).toContain("DOCUMENT PARTY OBLIGATIONS RULE");
    expect(systemMsg?.content).toContain("The lawyer is asking about all parties");
    expect(result.reply).toContain("BUYER");
    expect(result.reply).toContain("SELLER");
  });

  it("focuses on a specific party when partyName is provided", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([
      {
        id: 1, dealId: 1, uploadedByUserId: 1, filename: "cma-clearance.pdf", storageKey: "k1",
        mimeType: "application/pdf", sizeBytes: 512,
        extractedText: `The Buyer shall notify the CMA within 5 business days of signing. The CMA may impose conditions on the clearance. The Seller shall cooperate with any CMA information requests.`,
        aiProcessed: true, createdAt: new Date(),
      } as any,
    ]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_party_obligations", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: "Buyer", durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "**BUYER**\nObligations: Shall notify the CMA within 5 business days of signing.\nRights: None explicitly stated.\nResponsibilities: None explicitly stated.\n\nPlease review the document yourself before updating any checklist item status." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "What does the Buyer have to do?" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT PARTY OBLIGATIONS REQUEST");
    expect(systemMsg?.content).toContain("The lawyer is specifically asking about the party: \"Buyer\"");
    expect(result.reply).toContain("BUYER");
  });

  it("informs the lawyer when no documents have been uploaded", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getDocuments } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetDocs = vi.mocked(getDocuments);
    mockInvoke.mockReset();
    mockGetDocs.mockReset();

    mockGetDocs.mockResolvedValue([]);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "document_party_obligations", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "No documents have been uploaded to this deal yet. Please upload a document to the relevant checklist item." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "List the obligations of each party" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");
    expect(systemMsg?.content).toContain("DOCUMENT PARTY OBLIGATIONS REQUEST");
    expect(systemMsg?.content).toContain("no documents have been uploaded and processed");
    expect(result.reply).toBeTruthy();
  });
});

describe("chat.send — party_comparison intent (side-by-side party comparison)", () => {
  const makeComparisonItems = () => [
    { id: 1, dealId: 1, title: "CMA clearance", section: "conditions_precedent", status: "Outstanding", party: null, partyLabel: "Allen & Overy", partyCustom: null, partiesJson: null, notes: null, statusChangedAt: Date.now() - 86400000 * 3, position: 0 },
    { id: 2, dealId: 1, title: "FCA notification", section: "conditions_precedent", status: "Under Review", party: null, partyLabel: "Allen & Overy", partyCustom: null, partiesJson: null, notes: null, statusChangedAt: Date.now() - 86400000 * 1, position: 1 },
    { id: 3, dealId: 1, title: "Share purchase agreement", section: "transaction_documents", status: "Outstanding", party: null, partyLabel: "Slaughter and May", partyCustom: null, partiesJson: null, notes: null, statusChangedAt: Date.now() - 86400000 * 5, position: 2 },
    { id: 4, dealId: 1, title: "Board approval", section: "transaction_documents", status: "Under Review", party: null, partyLabel: "Slaughter and May", partyCustom: null, partiesJson: null, notes: null, statusChangedAt: Date.now() - 86400000 * 2, position: 3 },
    { id: 5, dealId: 1, title: "Companies House filing", section: "post_closing", status: "Outstanding", party: null, partyLabel: "Slaughter and May", partyCustom: null, partiesJson: null, notes: null, statusChangedAt: Date.now() - 86400000 * 1, position: 4 },
    { id: 6, dealId: 1, title: "Executed SPA", section: "transaction_documents", status: "Executed", party: null, partyLabel: "Allen & Overy", partyCustom: null, partiesJson: null, notes: null, statusChangedAt: Date.now() - 86400000 * 7, position: 5 },
  ] as any[];

  it("injects PARTY COMPARISON REQUEST block with summary counts and section breakdown for two parties", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getChecklistItems } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetItems = vi.mocked(getChecklistItems);
    mockInvoke.mockReset();
    mockGetItems.mockReset();

    mockGetItems.mockResolvedValue(makeComparisonItems());

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "party_comparison", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null, partyNames: ["Allen & Overy", "Slaughter and May"] }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "| Party | Outstanding | Under Review | Total |\n|---|---|---|---|\n| Allen & Overy | 1 | 1 | 2 |\n| Slaughter and May | 2 | 1 | 3 |\n\n**ALLEN & OVERY**\nConditions Precedent: Under Review (1): FCA notification; Outstanding (1): CMA clearance\nTransaction Documents: No outstanding or under review items.\nPost-Closing: No outstanding or under review items.\n\n**SLAUGHTER AND MAY**\nConditions Precedent: No outstanding or under review items.\nTransaction Documents: Under Review (1): Board approval; Outstanding (1): Share purchase agreement\nPost-Closing: Outstanding (1): Companies House filing" } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Compare what Allen & Overy and Slaughter and May still owe" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");

    // Verify PARTY COMPARISON REQUEST block is injected
    expect(systemMsg?.content).toContain("PARTY COMPARISON REQUEST");
    expect(systemMsg?.content).toContain("Allen & Overy");
    expect(systemMsg?.content).toContain("Slaughter and May");

    // Verify summary table is present
    expect(systemMsg?.content).toContain("SUMMARY");
    expect(systemMsg?.content).toContain("Party | Outstanding | Under Review | Total");
    expect(systemMsg?.content).toContain("Allen & Overy | 1 | 1 | 2");
    expect(systemMsg?.content).toContain("Slaughter and May | 2 | 1 | 3");

    // Verify section breakdown is present
    expect(systemMsg?.content).toContain("CONDITIONS PRECEDENT");
    expect(systemMsg?.content).toContain("TRANSACTION DOCUMENTS");
    expect(systemMsg?.content).toContain("POST-CLOSING");

    // Verify PARTY COMPARISON RULE is in the system prompt
    expect(systemMsg?.content).toContain("PARTY COMPARISON RULE");

    // Verify the reply contains the comparison
    expect(result.reply).toContain("Allen & Overy");
    expect(result.reply).toContain("Slaughter and May");
  });

  it("handles a party with no outstanding items gracefully", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getChecklistItems } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetItems = vi.mocked(getChecklistItems);
    mockInvoke.mockReset();
    mockGetItems.mockReset();

    // Only Slaughter and May has outstanding items; Allen & Overy has none
    const items = makeComparisonItems().filter((i: any) => i.status !== "Outstanding" && i.status !== "Under Review" || i.partyLabel !== "Allen & Overy") as any[];
    mockGetItems.mockResolvedValue(items);

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "party_comparison", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null, partyNames: ["Allen & Overy", "Slaughter and May"] }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "| Party | Outstanding | Under Review | Total |\n|---|---|---|---|\n| Allen & Overy | 0 | 0 | 0 |\n| Slaughter and May | 2 | 1 | 3 |\n\n**ALLEN & OVERY**: No outstanding or under review items in any section.\n\n**SLAUGHTER AND MAY**: [items listed]" } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Compare Allen & Overy and Slaughter and May" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");

    expect(systemMsg?.content).toContain("PARTY COMPARISON REQUEST");
    // Allen & Overy should show 0 | 0 | 0
    expect(systemMsg?.content).toContain("Allen & Overy | 0 | 0 | 0");
    expect(result.reply).toBeTruthy();
  });

  it("handles a party name not found in the checklist", async () => {
    const { invokeLLM } = await import("./_core/llm");
    const { getChecklistItems } = await import("./db");
    const mockInvoke = vi.mocked(invokeLLM);
    const mockGetItems = vi.mocked(getChecklistItems);
    mockInvoke.mockReset();
    mockGetItems.mockReset();

    mockGetItems.mockResolvedValue(makeComparisonItems());

    mockInvoke
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ intent: "party_comparison", matchedItemIds: [], newStatus: null, filterStatus: null, candidateItems: [], notFoundReference: null, partyName: null, durationThresholdDays: null, durationFilterStatus: null, emailPartyName: null, emailItemTitles: null, documentFilename: null, partyNames: ["Allen & Overy", "Unknown Firm LLP"] }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "| Party | Outstanding | Under Review | Total |\n|---|---|---|---|\n| Allen & Overy | 1 | 1 | 2 |\n| Unknown Firm LLP | 0 | 0 | 0 |\n\n**UNKNOWN FIRM LLP**: No items found assigned to this party. Please check the party name." } }],
      });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.send({ dealId: 1, message: "Compare Allen & Overy and Unknown Firm LLP" });

    const secondCallArgs = mockInvoke.mock.calls[1]?.[0];
    const systemMsg = secondCallArgs?.messages?.find((m: { role: string }) => m.role === "system");

    expect(systemMsg?.content).toContain("PARTY COMPARISON REQUEST");
    expect(systemMsg?.content).toContain("Unknown Firm LLP");
    // Unknown party should show not found message
    expect(systemMsg?.content).toContain("No items found assigned to");
    expect(result.reply).toBeTruthy();
  });
});
