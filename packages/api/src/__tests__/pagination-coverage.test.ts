import { isProcedure } from "@orpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PAGE_LIMIT_MAX } from "@watchdog/schemas/shared";

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

  it("gives every page procedure a cursor, a page size and a cap on it", () => {
    const paged = paths.filter((path) => {
      const procedure = procedureAt(path);
      return (
        procedure !== undefined &&
        isPage(unwrap(procedure["~orpc"].outputSchema))
      );
    });
    // Cases, Deleted Cases, Entities, Claims, Events, Questions, Identifiers (2), Connections (2),
    // Evidence, Jobs, Proposals, Tasks, graph writes, history, recent activity.
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
