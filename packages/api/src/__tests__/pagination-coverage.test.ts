import { isProcedure } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";
import { LIST_DEFS } from "@watchdog/schemas/testing";

import { router } from "../router";
import { procedurePaths } from "./org-isolation-fixtures";

/**
 * Procedures that return a bounded list (`boundedListSchema`) on purpose, each with the reason it cannot grow without
 * bound. Every other procedure that returns a list returns a page (`{ items, nextCursor }`),
 * takes `cursor` and `limit`, and caps the page size: adding an unpaged list to the router
 * fails this file until it is paged or listed here with a reason.
 */
const BARE_LISTS: Readonly<Record<string, string>> = {
  "capabilities.list":
    "the static Cap registry (about sixty entries, fixed at build time), identical for every organization",
  "capabilities.listPlaybooks":
    "the static playbook registry (a handful of entries, fixed at build time)",
  "tasks.reorder":
    "answers with the one column the caller just reordered: at most the ARRAY_MAX ids it sent",
  "credentials.list":
    "one slot per credential name the Caps declare: bounded by the registry, never by data",
  "identifiers.getMany":
    "answers with the rows of the at most ARRAY_MAX ids the caller sent",
  "evidence.getMany":
    "answers with the rows of the at most ARRAY_MAX ids the caller sent",
  "entities.getMany":
    "answers with the rows of the at most ARRAY_MAX ids the caller sent",
  "entities.matchNames":
    "answers with the Entities that the at most ENTITY_NAME_LOOKUP_MAX names the caller sent may mean (a few per name at most: a name and its slug)",
  "edges.getMany":
    "answers with the rows of the at most ARRAY_MAX ids the caller sent",
  "claims.getMany":
    "answers with the rows of the at most ARRAY_MAX ids the caller sent",
  "events.getMany":
    "answers with the rows of the at most ARRAY_MAX ids the caller sent",
  "questions.getMany":
    "answers with the rows of the at most ARRAY_MAX ids the caller sent",
};

/**
 * Procedures that answer a capped envelope on purpose (no cursor; `isTruncated`, or a capped
 * `total`, says when it was cut), each with its cap and why it is not paged. Every other procedure
 * whose output carries an `items` list is a page, and no other output says `isTruncated`: adding
 * an unpaged envelope fails this file until it is listed here.
 */
const CAPPED_ENVELOPES: Readonly<Record<string, string>> = {
  "evidence.listProviderCalls":
    "the provider calls behind one Evidence row: a Job makes a handful; at most PROVIDER_CALL_LIST_MAX (200), with isTruncated past it",
  "graph.ego":
    "the Dossier ego graph draws one star around an Entity, so it cannot arrive a page at a time: at most GRAPH_EGO_EDGE_MAX (60) of its Connections, most recently updated first, with isTruncated past it; the Connections tab pages them all",
  "graph.snapshot":
    "the Graph page draws one picture, so it cannot arrive a page at a time: at most GRAPH_SNAPSHOT_ENTITY_MAX (150) most connected Entities and GRAPH_SNAPSHOT_EDGE_MAX (600) Connections between them, with isTruncated past either",
  "jobs.listProviderCalls":
    "one Job's provider calls: a handful per Job; at most PROVIDER_CALL_LIST_MAX (200), with isTruncated past it",
  "tasks.board":
    "the board's open columns: drag and drop reorders whole columns, so they cannot arrive a page at a time; at most TASK_BOARD_MAX (500) Tasks, with isTruncated past it, and Done and Dropped are the paged tasks.list",
  "tasks.due":
    "the Dashboard's due list: the first TASK_DUE_LIST_LIMIT (8) open Tasks overdue or due soon and their capped total; the full set is the board",
};

/**
 * Paged procedures that are not declared lists (ADR-0007): the named legacy feeds, each with its
 * reason (`apps/web`'s infinite queries for the two web feeds are exempt in `oxlint.config.ts` by
 * the same names). Every other
 * procedure that returns a page takes a `LIST_DEFS` member's `input` and returns a list page
 * (`total` beside `items` and `nextCursor`): a hand-rolled paged procedure fails this file until
 * its list is declared or it is listed here.
 */
const NOT_DECLARED: Readonly<Record<string, string>> = {
  "activity.listRecent":
    "the feed collapses entries by group in a window function before the keyset; not a filterable list",
  "history.list":
    "one row's history, ordered by the bigint history id itself; never filtered, sorted or searched",
  "cases.list":
    "the Case picker and `wd cases list`: name order only, one organization's Cases (a handful), no filter or search a screen needs",
  "jobs.listForCase":
    "the Jobs queue's feed and `wd jobs list`: newest first by update, read a page at a time with no filter, search or total; Collect's declared list is collect.list",
  "graph.listWrites":
    "the Graph write log: newest first, read by `wd` and the agent-ingress check only; no screen filters, sorts or searches it",
};

function procedureAt(path: string) {
  let current: unknown = router;
  for (const key of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return isProcedure(current) ? current : undefined;
}

function unwrap(schema: unknown): z.ZodType | undefined {
  if (schema instanceof z.ZodOptional) return unwrap(schema.unwrap());
  return schema instanceof z.ZodType ? schema : undefined;
}

function isBareArray(schema: z.ZodType | undefined): boolean {
  return schema instanceof z.ZodArray;
}

/** The array's `maxItems`, as the OpenAPI document states it (`boundedListSchema`). */
function arrayMax(schema: z.ZodType | undefined): unknown {
  if (schema === undefined) return undefined;
  const json: unknown = z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
  });
  return typeof json === "object" && json !== null
    ? Reflect.get(json, "maxItems")
    : undefined;
}

/**
 * An object output that is a list without a cursor: an `items` list and no `nextCursor`, or any
 * output that says it was cut (`isTruncated`).
 */
function isCappedEnvelope(schema: z.ZodType | undefined): boolean {
  if (!(schema instanceof z.ZodObject)) return false;
  const { shape } = schema;
  return (
    ("items" in shape && !("nextCursor" in shape)) || "isTruncated" in shape
  );
}

function isPage(schema: z.ZodType | undefined): boolean {
  return (
    schema instanceof z.ZodObject &&
    "items" in schema.shape &&
    "nextCursor" in schema.shape
  );
}

type LimitProps = { maximum?: unknown; default?: unknown };

/** The `cursor` and `limit` properties of a procedure's input, as JSON Schema sees them. */
function inputProperties(schema: z.ZodType | undefined): {
  cursor: unknown;
  limit: LimitProps | undefined;
} {
  if (schema === undefined) return { cursor: undefined, limit: undefined };
  const json: unknown = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  });
  const properties =
    typeof json === "object" && json !== null
      ? Reflect.get(json, "properties")
      : undefined;
  if (typeof properties !== "object" || properties === null) {
    return { cursor: undefined, limit: undefined };
  }
  const limit: unknown = Reflect.get(properties, "limit");
  return {
    cursor: Reflect.get(properties, "cursor"),
    limit: typeof limit === "object" && limit !== null ? limit : undefined,
  };
}

describe("list procedures are paged", () => {
  const paths = procedurePaths(router);

  it("finds the router's procedures", () => {
    expect(paths.length).toBeGreaterThan(40);
  });

  it("returns no bare list except the reasoned static ones", () => {
    const bare = paths.filter((path) => {
      const procedure = procedureAt(path);
      return (
        procedure !== undefined &&
        isBareArray(unwrap(procedure["~orpc"].outputSchema))
      );
    });
    expect([...bare].sort()).toEqual(Object.keys(BARE_LISTS).sort());
    for (const path of bare) {
      expect(
        arrayMax(unwrap(procedureAt(path)?.["~orpc"].outputSchema)),
        `${path} is a boundedListSchema with a server-enforced maximum`
      ).toBeGreaterThan(0);
    }
  });

  it("answers a list without a cursor only where it is capped and reasoned", () => {
    const envelopes = paths.filter((path) => {
      const procedure = procedureAt(path);
      return (
        procedure !== undefined &&
        isCappedEnvelope(unwrap(procedure["~orpc"].outputSchema))
      );
    });
    expect([...envelopes].sort()).toEqual(Object.keys(CAPPED_ENVELOPES).sort());
    for (const path of envelopes) {
      const output = unwrap(procedureAt(path)?.["~orpc"].outputSchema);
      expect(
        output instanceof z.ZodObject &&
          ("isTruncated" in output.shape || "total" in output.shape),
        `${path} says when it was cut (isTruncated or total)`
      ).toBe(true);
    }
  });

  it("gives every page procedure a cursor, a page size and a cap on it", () => {
    const paged = paths.filter((path) => {
      const procedure = procedureAt(path);
      return (
        procedure !== undefined &&
        isPage(unwrap(procedure["~orpc"].outputSchema))
      );
    });
    // Cases, Deleted Cases, Entities, Claims, Events, Questions, Identifiers, Connections,
    // Evidence (and its picker), Jobs, Proposals (and the queue), Tasks, graph writes, history,
    // recent activity.
    expect(paged.length).toBeGreaterThanOrEqual(17);
    for (const path of paged) {
      const procedure = procedureAt(path);
      const { cursor, limit } = inputProperties(
        unwrap(procedure?.["~orpc"].inputSchema)
      );
      expect(cursor, `${path} takes a cursor`).toBeDefined();
      expect(limit, `${path} takes a limit`).toBeDefined();
      expect(limit?.default, `${path} defaults the limit`).toBeGreaterThan(0);
      expect(limit?.maximum, `${path} caps the limit`).toBeLessThanOrEqual(
        PAGE_LIMIT_MAX
      );
    }
  });
});

/**
 * Procedures that serve a declared list a second time through a slimmer select (same `input`,
 * binding and paging), each with its list and reason. Every other declared list has exactly one
 * procedure.
 */
const PROJECTIONS: Readonly<Record<string, { list: string; reason: string }>> =
  {
    "evidence.pickerPage": {
      list: "evidence",
      reason:
        "the Evidence pickers need title parts and capture time, not the record (bodies made a 20-row page 51 KB, #566)",
    },
    "entities.pickerPage": {
      list: "entities",
      reason:
        "the Entity pickers need label parts and kind, not the record with its Connection counts and sole Connection (#573)",
    },
    "proposals.queuePage": {
      list: "proposals",
      reason:
        "the Triage queue, the Dashboard and the Case overview show a row's summary, status, source, counts and time, not its patch (20-op patches made a 50-row page 693 KB, #580)",
    },
  };

describe("paged lists are declared lists", () => {
  const paths = procedurePaths(router);
  const paged = paths.filter((path) => {
    const procedure = procedureAt(path);
    return (
      procedure !== undefined && isPage(unwrap(procedure["~orpc"].outputSchema))
    );
  });
  const declaredInputs = new Set<unknown>(LIST_DEFS.map((def) => def.input));

  it("takes a declared list's input and returns a list page with a total", () => {
    for (const path of paged) {
      if (path in NOT_DECLARED) continue;
      const procedure = procedureAt(path);
      const output = unwrap(procedure?.["~orpc"].outputSchema);
      expect(
        declaredInputs.has(procedure?.["~orpc"].inputSchema),
        `${path} takes a LIST_DEFS member's input`
      ).toBe(true);
      expect(
        output instanceof z.ZodObject && "total" in output.shape,
        `${path} returns total`
      ).toBe(true);
    }
  });

  it("keeps every undeclared entry a real paged procedure without a total", () => {
    for (const path of Object.keys(NOT_DECLARED)) {
      expect(paged, `${path} is a paged procedure`).toContain(path);
      const output = unwrap(procedureAt(path)?.["~orpc"].outputSchema);
      expect(
        output instanceof z.ZodObject && "total" in output.shape,
        `${path} returns total: declare it and drop the entry`
      ).toBe(false);
    }
  });

  it("serves each declared list from exactly one procedure", () => {
    for (const def of LIST_DEFS) {
      const serving = paths.filter(
        (path) =>
          procedureAt(path)?.["~orpc"].inputSchema === def.input &&
          !(path in PROJECTIONS)
      );
      expect(serving, `list ${def.name}`).toHaveLength(1);
    }
  });

  it("keeps every projection a procedure over a declared list's input", () => {
    for (const [path, { list }] of Object.entries(PROJECTIONS)) {
      const def = LIST_DEFS.find((candidate) => candidate.name === list);
      expect(def, `${path} names a declared list`).toBeDefined();
      expect(
        procedureAt(path)?.["~orpc"].inputSchema,
        `${path} takes ${list}'s input`
      ).toBe(def?.input);
    }
  });
});
