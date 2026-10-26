import { isProcedure } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";
import { LIST_DEFS } from "@watchdog/schemas/testing";

import { router } from "../router";
import { procedurePaths } from "./org-isolation-fixtures";

/**
 * Procedures that return a bare list on purpose, each with the reason it cannot grow without
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
};

/**
 * Procedures that answer a capped envelope (`{ items, isTruncated }` or `{ items, total }`, no
 * cursor) on purpose, each with its cap and why it is not paged. Every other procedure whose
 * output carries an `items` list is a page: adding an unpaged `items` envelope fails this file
 * until it is listed here.
 */
const CAPPED_ENVELOPES: Readonly<Record<string, string>> = {
  "tasks.board":
    "the board's open columns: drag and drop reorders whole columns, so they cannot arrive a page at a time; at most TASK_BOARD_MAX (500) Tasks, with isTruncated past it, and Done and Dropped are the paged tasks.list",
  "tasks.due":
    "the Dashboard's due list: the first TASK_DUE_LIST_LIMIT (8) open Tasks overdue or due soon and their capped total; the full set is the board",
};

/**
 * Paged procedures that are not declared lists (ADR-0007), each with its reason. Every other
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
    "not declared yet: moves in its own ticket after the pilot (#547)",
  "claims.list":
    "not declared yet: moves in its own ticket after the pilot (#547)",
  "events.list":
    "not declared yet: moves in its own ticket after the pilot (#547)",
  "questions.list":
    "not declared yet: moves in its own ticket after the pilot (#547)",
  "edges.list":
    "not declared yet: moves in its own ticket after the pilot (#547)",
  "edges.listForCase":
    "not declared yet: moves in its own ticket after the pilot (#547)",
  "jobs.listForCase":
    "not declared yet: Collect's queue needs its own design first (#553)",
  "graph.listWrites":
    "not declared yet: moves in its own ticket after the pilot (#547)",
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

/** An object output with an `items` list but no cursor: a capped envelope, or an unpaged list. */
function isItemsEnvelope(schema: z.ZodType | undefined): boolean {
  return (
    schema instanceof z.ZodObject &&
    "items" in schema.shape &&
    !("nextCursor" in schema.shape)
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
  });

  it("answers an items envelope without a cursor only where it is capped and reasoned", () => {
    const envelopes = paths.filter((path) => {
      const procedure = procedureAt(path);
      return (
        procedure !== undefined &&
        isItemsEnvelope(unwrap(procedure["~orpc"].outputSchema))
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
    // Cases, Deleted Cases, Entities, Claims, Events, Questions, Identifiers, Connections (2),
    // Evidence, Jobs, Proposals, Tasks, graph writes, history, recent activity.
    expect(paged.length).toBeGreaterThanOrEqual(16);
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
