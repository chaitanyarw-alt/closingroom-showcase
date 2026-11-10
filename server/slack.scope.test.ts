import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { deals, slackIntakes } from "../drizzle/schema";
import {
  activeDealPredicate,
  getDealsForUser,
  getSlackWorkspaceDealById,
  getSlackWorkspaceDeals,
  getSlackWorkspaceLink,
  linkSlackIntakeToDeal,
  slackWorkspacePredicate,
} from "./db";

const driver = vi.hoisted(() => {
  const query = vi.fn();
  const createPool = vi.fn(() => ({ promise: () => ({ query }) }));
  return { query, createPool };
});

// Vitest externalizes Drizzle, so its internal mysql2 import may bypass vi.mock.
// Intercept the public adapter factory too, passing ONLY our fixture client to
// the real Drizzle constructor. Query builders and result mapping stay real.
vi.mock("mysql2", () => ({
  createPool: driver.createPool,
  default: { createPool: driver.createPool },
}));

vi.mock("drizzle-orm/mysql2", async importOriginal => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return {
    ...actual,
    drizzle: Object.assign(
      () => actual.drizzle({ client: driver.createPool() as never }),
      { mock: actual.drizzle.mock },
    ),
  };
});

type Row = Record<string, unknown>;
type Context = Record<string, Row>;
type CapturedQuery = { sql: string; params: unknown[] };
const TEAM = "TOWNER";
const OWNER = 11;
const OTHER_OWNER = 22;
const ACTIVE_IDS = [101, 102, 103];
let fixtures: Record<string, Row[]>;
let queries: CapturedQuery[];
let beforeUpdate: (() => void) | undefined;

function deal(id: number, userId: number, name: string, overrides: Row = {}): Row {
  return {
    ...Object.fromEntries(Object.keys(getTableColumns(deals)).map(key => [key, null])),
    id, userId, name, isTestData: 0, isSeedData: 0,
    createdAt: "2026-01-01 00:00:00", updatedAt: "2026-01-01 00:00:00",
    ...overrides,
  };
}

function intake(overrides: Row = {}): Row {
  return {
    ...Object.fromEntries(Object.keys(getTableColumns(slackIntakes)).map(key => [key, null])),
    id: 501, teamId: TEAM, ownerUserId: OWNER, channelId: "CFIXTURE",
    question: "Fixture question", status: "received",
    createdAt: "2026-01-01 00:00:00", updatedAt: "2026-01-01 00:00:00",
    ...overrides,
  };
}

// A deliberately small, fail-closed evaluator for Drizzle's SELECT/UPDATE SQL.
// It evaluates the SQL's joins and AND predicates, rather than implementing a
// separate owner/active filter that could hide a missing production predicate.
// Only in-memory fixture rows are read or updated; INSERT/DELETE are forbidden.
const COLUMN = "`[A-Za-z_][A-Za-z0-9_]*`(?:\\.`[A-Za-z_][A-Za-z0-9_]*`)?";

function value(token: string, context: Context, params: unknown[]): unknown {
  if (token.startsWith("$P")) return params[Number(token.slice(2))];
  if (/^\d+$/.test(token)) return Number(token);
  const identifiers = [...token.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  if (identifiers.length === 2) return context[identifiers[0]]?.[identifiers[1]];
  if (identifiers.length === 1) return Object.values(context)[0]?.[identifiers[0]];
  throw new Error(`Unsupported fixture SQL value: ${token}`);
}

function matches(expression: string, context: Context, params: unknown[]): boolean {
  const comparison = new RegExp(
    `(${COLUMN})\\s*(is null|=|>)\\s*(${COLUMN}|\\$P\\d+|\\d+)?`, "gi",
  );
  let result = true;
  let count = 0;
  const remainder = expression.replace(comparison, (_all, left: string, op: string, right?: string) => {
    count++;
    const lhs = value(left, context, params);
    if (op.toLowerCase() === "is null") result = result && lhs === null;
    else {
      if (!right) throw new Error("Missing SQL comparison operand");
      const rhs = value(right, context, params);
      // Match SQL NULL semantics: NULL equality is never true.
      result = result && lhs != null && rhs != null
        && (op === "=" ? lhs === rhs : Number(lhs) > Number(rhs));
    }
    return "";
  }).replace(/\band\b|[()\s]/gi, "");
  if (!count || remainder) throw new Error(`Unsupported fixture predicate: ${expression}`);
  return result;
}

function contextsFor(statement: string, params: unknown[]): Context[] {
  const from = /\bfrom `([^`]+)`/i.exec(statement);
  if (!from || !fixtures[from[1]]) throw new Error(`Unsupported fixture FROM: ${statement}`);
  let contexts: Context[] = fixtures[from[1]].map(row => ({ [from[1]]: row }));
  const joins = /inner join `([^`]+)` on (.*?)(?= inner join | where |$)/gi;
  for (const join of statement.matchAll(joins)) {
    const table = join[1];
    if (!fixtures[table]) throw new Error(`Unsupported fixture JOIN: ${table}`);
    contexts = contexts.flatMap(context => fixtures[table]
      .map(row => ({ ...context, [table]: row }))
      .filter(candidate => matches(join[2], candidate, params)));
  }
  const where = /\bwhere (.*?)(?= order by | limit |$)/i.exec(statement);
  if (where) contexts = contexts.filter(context => matches(where[1], context, params));
  return contexts;
}

function executeFixtureQuery(options: { sql: string; rowsAsArray?: boolean }, params: unknown[]) {
  queries.push({ sql: options.sql, params: [...params] });
  let index = 0;
  const statement = options.sql.replace(/\?/g, () => `$P${index++}`).replace(/\s+/g, " ").trim();
  if (index !== params.length) throw new Error("Fixture SQL parameter count mismatch");

  if (/^select /i.test(statement)) {
    if (!options.rowsAsArray) throw new Error("Expected Drizzle mysql2 array-mode SELECT");
    let contexts = contextsFor(statement, params);
    const order = /order by (`[^`]+`(?:\.`[^`]+`)?) (asc|desc)/i.exec(statement);
    if (order) contexts.sort((a, b) => String(value(order[1], a, params))
      .localeCompare(String(value(order[1], b, params))) * (order[2] === "asc" ? 1 : -1));
    const limit = /limit (\$P\d+)/i.exec(statement);
    if (limit) contexts = contexts.slice(0, Number(value(limit[1], {}, params)));
    const projection = statement.slice(7, statement.indexOf(" from ")).split(", ");
    return [contexts.map(context => projection.map(column => value(column, context, params))), []];
  }

  if (/^update `slack_intakes` /i.test(statement)) {
    beforeUpdate?.();
    const exists = /\bexists \((select 1 from .*?)\)\)\s*$/i.exec(statement);
    const whereIndex = statement.indexOf(" where ");
    if (!exists || whereIndex < 0) throw new Error("Intake UPDATE must contain a scoped EXISTS");
    const outer = statement.slice(whereIndex + 7, exists.index).replace(/\s+and\s*$/i, "");
    const eligible = contextsFor(exists[1], params).length > 0;
    const rows = fixtures.slack_intakes.filter(row => matches(outer, { slack_intakes: row }, params) && eligible);
    const assignment = /`dealId` = (\$P\d+)/.exec(statement);
    if (!assignment) throw new Error("Expected fixture dealId assignment");
    rows.forEach(row => { row.dealId = value(assignment[1], {}, params); });
    return [{ affectedRows: rows.length, insertId: 0 }, []];
  }
  throw new Error(`Forbidden fixture SQL (no inserts or production writes): ${options.sql}`);
}

function assertActiveSql(sql: string) {
  expect(sql).toContain("`deals`.`archivedAt` is null");
  expect(sql).toContain("`deals`.`deletedAt` is null");
  expect(sql).toContain("`deals`.`isTestData` = ?");
  expect(sql).toContain("`deals`.`isSeedData` = ?");
}

function assertScopedSql(query: CapturedQuery) {
  const where = query.sql.slice(query.sql.indexOf(" where ") + 7);
  expect(query.sql).toContain("inner join `slack_workspace_links` on `slack_workspace_links`.`ownerUserId` = `deals`.`userId`");
  expect(query.sql).toContain("inner join `users` on `users`.`id` = `slack_workspace_links`.`ownerUserId`");
  expect(where).toContain("`slack_workspace_links`.`teamId` = ?");
  expect(where).toContain("`slack_workspace_links`.`enabled` = ?");
  expect(where).toContain("`slack_workspace_links`.`ownerUserId` = ?");
  expect(where).toContain("`deals`.`userId` = ?");
  assertActiveSql(where);
  expect(query.sql).not.toMatch(/deal_members|\bor\b/i);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture-only:fixture-only@invalid.test/never-connect");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live HTTP/Slack calls are forbidden in scope tests"); }));
  driver.createPool.mockClear();
  driver.query.mockReset();
  queries = [];
  beforeUpdate = undefined;
  fixtures = {
    users: [{ id: OWNER }, { id: OTHER_OWNER }],
    slack_workspace_links: [
      { teamId: TEAM, ownerUserId: OWNER, enabled: 1 },
      { teamId: "TOTHER", ownerUserId: OTHER_OWNER, enabled: 1 },
      { teamId: "TDISABLED", ownerUserId: OWNER, enabled: 0 },
      { teamId: "TORPHAN", ownerUserId: 33, enabled: 1 },
      { teamId: "TZERO", ownerUserId: 0, enabled: 1 },
    ],
    deals: [
      deal(103, OWNER, "Project Cedar"), deal(101, OWNER, "Project Aspen"),
      deal(102, OWNER, "Project Birch"), deal(201, OTHER_OWNER, "Other owner's active deal"),
      deal(104, OWNER, "Archived", { archivedAt: 0 }),
      deal(105, OWNER, "Deleted", { deletedAt: 0 }),
      deal(106, OWNER, "Test data", { isTestData: 1 }),
      deal(107, OWNER, "Seed data", { isSeedData: 1 }),
      deal(301, 33, "Missing owner's deal"),
    ],
    // Even an accepted membership cannot expand the Slack owner boundary.
    deal_members: [{ dealId: 201, userId: OWNER, inviteStatus: "accepted" }],
    slack_intakes: [intake()],
  };
  driver.query.mockImplementation(async (options, params) => executeFixtureQuery(options, params));
});

afterEach(() => {
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  expect(queries.every(query => /^(select|update `slack_intakes`) /i.test(query.sql))).toBe(true);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Slack workspace SQL scope predicates", () => {
  it("compiles every active-deal exclusion into SQL, not post-query filtering", () => {
    const query = new MySqlDialect().sqlToQuery(activeDealPredicate()!);
    assertActiveSql(query.sql);
    expect(query.params).toEqual([0, 0]);
  });

  it("binds the team, enabled mapping and both owner columns alongside active exclusions", () => {
    const query = new MySqlDialect().sqlToQuery(slackWorkspacePredicate(TEAM, OWNER)!);
    expect(query.sql).toContain("`slack_workspace_links`.`teamId` = ?");
    expect(query.sql).toContain("`slack_workspace_links`.`enabled` = ?");
    expect(query.sql).toContain("`slack_workspace_links`.`ownerUserId` = ?");
    expect(query.sql).toContain("`deals`.`userId` = ?");
    assertActiveSql(query.sql);
    expect(query.params).toEqual([TEAM, 1, OWNER, OWNER, 0, 0]);
  });
});

describe("getSlackWorkspaceLink", () => {
  it("returns only the enabled team mapping whose positive-ID owner exists", async () => {
    expect(await getSlackWorkspaceLink(TEAM)).toEqual({ teamId: TEAM, ownerUserId: OWNER });
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("inner join `users` on `users`.`id` = `slack_workspace_links`.`ownerUserId`");
    expect(queries[0].sql).toContain("`slack_workspace_links`.`teamId` = ?");
    expect(queries[0].sql).toContain("`slack_workspace_links`.`enabled` = ?");
    expect(queries[0].sql).toContain("`users`.`id` > ?");
    expect(queries[0].params).toEqual([TEAM, 1, 0, 1]);
  });

  it.each(["TDISABLED", "TUNKNOWN", "TORPHAN", "TZERO"])("does not resolve absent or invalid mapping %s", async teamId => {
    // A zero-ID user must not make an invalid owner mapping valid either.
    fixtures.users.push({ id: 0 });
    expect(await getSlackWorkspaceLink(teamId)).toBeUndefined();
    expect(queries).toHaveLength(1);
  });

  it.each([undefined, null, "", "not-a-team", "towner", "TOWNER' OR 1=1"])("rejects invalid team %s without a query", async teamId => {
    expect(await getSlackWorkspaceLink(teamId as string)).toBeUndefined();
    expect(driver.query).not.toHaveBeenCalled();
    expect(driver.createPool).not.toHaveBeenCalled();
  });
});

describe("Slack workspace option and ID queries", () => {
  it("matches the owner's three active dashboard deals and excludes other-owner membership", async () => {
    const ownerDeals = await getDealsForUser(OWNER);
    const options = await getSlackWorkspaceDeals(TEAM, OWNER);
    expect(ownerDeals.map(row => row.id).sort()).toEqual(ACTIVE_IDS);
    expect(options).toEqual([
      { id: 101, name: "Project Aspen" },
      { id: 102, name: "Project Birch" },
      { id: 103, name: "Project Cedar" },
    ]);
    expect(options.map(row => row.id)).toEqual(ownerDeals.map(row => row.id).sort());
    assertScopedSql(queries[1]);
    expect(queries[1].params).toEqual([TEAM, 1, OWNER, OWNER, 0, 0]);
    expect(queries[1].sql).toContain("order by `deals`.`name` asc");
    for (const id of ACTIVE_IDS) {
      expect(await getSlackWorkspaceDealById(TEAM, OWNER, id)).toMatchObject({ id, userId: OWNER });
      assertScopedSql(queries.at(-1)!);
      expect(queries.at(-1)!.params).toEqual([id, TEAM, 1, OWNER, OWNER, 0, 0, 1]);
    }
  });

  it.each([201, 104, 105, 106, 107, 999])("never returns other-owner, ineligible or unknown deal ID %i", async id => {
    expect(await getSlackWorkspaceDealById(TEAM, OWNER, id)).toBeUndefined();
    assertScopedSql(queries[0]);
    expect(queries[0].sql).toContain("`deals`.`id` = ?");
    expect(queries[0].params).toEqual([id, TEAM, 1, OWNER, OWNER, 0, 0, 1]);
  });

  it.each([
    ["TDISABLED", OWNER, 101], ["TUNKNOWN", OWNER, 101],
    ["TORPHAN", 33, 301], [TEAM, OTHER_OWNER, 201], ["TOTHER", OWNER, 101],
  ])("returns no options or ID lookup for unmapped scope %s/%i", async (teamId, ownerId, id) => {
    expect(await getSlackWorkspaceDeals(teamId as string, ownerId as number)).toEqual([]);
    expect(await getSlackWorkspaceDealById(teamId as string, ownerId as number, id as number)).toBeUndefined();
    expect(queries).toHaveLength(2);
    queries.forEach(assertScopedSql);
  });

  it("requires the owner user to still exist for mapping, options and ID lookup", async () => {
    fixtures.users = fixtures.users.filter(row => row.id !== OWNER);
    expect(await getSlackWorkspaceLink(TEAM)).toBeUndefined();
    expect(await getSlackWorkspaceDeals(TEAM, OWNER)).toEqual([]);
    expect(await getSlackWorkspaceDealById(TEAM, OWNER, 101)).toBeUndefined();
    queries.slice(1).forEach(assertScopedSql);
  });

  it.each([
    [undefined, OWNER], [null, OWNER], ["", OWNER], ["invalid", OWNER], ["towner", OWNER],
    [TEAM, undefined], [TEAM, null], [TEAM, 0], [TEAM, -1], [TEAM, 1.5],
    [TEAM, Number.NaN], [TEAM, Number.POSITIVE_INFINITY], [TEAM, Number.MAX_SAFE_INTEGER + 1], [TEAM, "11"],
  ])("fails closed for invalid/no scope %s/%s without any deal query", async (teamId, ownerId) => {
    expect(await getSlackWorkspaceDeals(teamId as string, ownerId as number)).toEqual([]);
    expect(await getSlackWorkspaceDealById(teamId as string, ownerId as number, 101)).toBeUndefined();
    expect(driver.query).not.toHaveBeenCalled();
    expect(driver.createPool).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "101"])(
    "rejects invalid deal ID %s without any query", async id => {
      expect(await getSlackWorkspaceDealById(TEAM, OWNER, id as number)).toBeUndefined();
      expect(driver.query).not.toHaveBeenCalled();
    },
  );
});

describe("linkSlackIntakeToDeal", () => {
  it("links an eligible owner deal with the same scope revalidated in the UPDATE SQL", async () => {
    await expect(linkSlackIntakeToDeal(501, 101)).resolves.toBeUndefined();
    expect(fixtures.slack_intakes[0].dealId).toBe(101);
    expect(queries).toHaveLength(3);
    assertScopedSql(queries[1]);
    const update = queries[2];
    assertScopedSql(update);
    expect(update.sql).toContain("exists (select 1 from `deals`");
    expect(update.sql).toContain("`slack_intakes`.`id` = ?");
    expect(update.sql).toContain("`slack_intakes`.`teamId` = ?");
    expect(update.sql).toContain("`slack_intakes`.`ownerUserId` = ?");
    expect(update.params).toEqual([101, 501, TEAM, OWNER, 101, TEAM, 1, OWNER, OWNER, 0, 0]);
  });

  it.each([201, 104, 105, 106, 107, 999])("rejects out-of-scope deal %i without an UPDATE", async id => {
    await expect(linkSlackIntakeToDeal(501, id)).rejects.toThrow("Selected deal is not available to this Slack workspace");
    expect(queries).toHaveLength(2);
    assertScopedSql(queries[1]);
    expect(queries.every(query => query.sql.startsWith("select "))).toBe(true);
    expect(fixtures.slack_intakes[0].dealId).toBeNull();
  });

  it.each([
    { teamId: null }, { ownerUserId: null }, { teamId: "", ownerUserId: 0 },
  ])("rejects legacy/no-scope intake %j before any deal query", async overrides => {
    fixtures.slack_intakes = [intake(overrides)];
    await expect(linkSlackIntakeToDeal(501, 101)).rejects.toThrow("Slack intake has no verified workspace scope");
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("from `slack_intakes`");
  });

  it("rejects an unknown intake before querying deals", async () => {
    await expect(linkSlackIntakeToDeal(999, 101)).rejects.toThrow("Slack intake has no verified workspace scope");
    expect(queries).toHaveLength(1);
  });

  it.each(["TDISABLED", "TUNKNOWN", "TORPHAN"])("does not link an intake with unavailable mapping %s", async teamId => {
    fixtures.slack_intakes = [intake({ teamId, ownerUserId: teamId === "TORPHAN" ? 33 : OWNER })];
    await expect(linkSlackIntakeToDeal(501, teamId === "TORPHAN" ? 301 : 101))
      .rejects.toThrow("Selected deal is not available to this Slack workspace");
    expect(queries).toHaveLength(2);
    expect(queries.every(query => query.sql.startsWith("select "))).toBe(true);
  });

  it.each([
    "mapping disabled", "mapping removed", "owner remapped", "owner deleted", "deal owner changed",
    "deal archived", "deal deleted", "deal marked test", "deal marked seed", "intake team changed", "intake owner changed",
  ])("rejects linking when %s between lookup and UPDATE", async change => {
    beforeUpdate = () => {
      const link = fixtures.slack_workspace_links.find(row => row.teamId === TEAM)!;
      const selected = fixtures.deals.find(row => row.id === 101)!;
      switch (change) {
        case "mapping disabled": link.enabled = 0; break;
        case "mapping removed": fixtures.slack_workspace_links = fixtures.slack_workspace_links.filter(row => row.teamId !== TEAM); break;
        case "owner remapped": link.ownerUserId = OTHER_OWNER; break;
        case "owner deleted": fixtures.users = fixtures.users.filter(row => row.id !== OWNER); break;
        case "deal owner changed": selected.userId = OTHER_OWNER; break;
        case "deal archived": selected.archivedAt = 1; break;
        case "deal deleted": selected.deletedAt = 1; break;
        case "deal marked test": selected.isTestData = 1; break;
        case "deal marked seed": selected.isSeedData = 1; break;
        case "intake team changed": fixtures.slack_intakes[0].teamId = "TOTHER"; break;
        case "intake owner changed": fixtures.slack_intakes[0].ownerUserId = OTHER_OWNER; break;
        default: throw new Error(`Unknown fixture change: ${change}`);
      }
    };
    await expect(linkSlackIntakeToDeal(501, 101)).rejects.toThrow("Slack intake scope changed; linking rejected");
    expect(queries).toHaveLength(3);
    assertScopedSql(queries[2]);
    expect(fixtures.slack_intakes[0].dealId).toBeNull();
  });
});
