import type { Row } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
  entityGlobalFilterFn,
  entityTableColumns,
  type EntityTableActions,
} from "@/domains/entities/components/entity-table.columns";
import type { EntityConnectionPeer } from "@/domains/entities/lib/connection-peers";
import type { EntityRecord } from "@/domains/entities/types";
import type { DataTableFeatures } from "@/shared/ui/data-table/table-features";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const ENTITY: EntityRecord = {
  version: 1,
  id: testId(1),
  caseId: testCaseId(10),
  slug: "alpha",
  name: "Alpha Entity",
  kind: "person",
  summary: "Lead subject",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ACTIONS: EntityTableActions = {
  peersByEntityId: new Map(),
  updateKind: () => {},
  updateSummary: () => {},
  updateNotes: async () => {},
  entityOptions: [],
  createConnection: async () => {},
  updateConnection: async () => {},
  deleteConnection: async () => {},
  onOpenEntity: () => {},
  onCopyEntityLink: () => {},
  onCopyEntityMarkdown: () => {},
  onDeleteEntity: () => {},
};

function asRow(entity: EntityRecord): Row<DataTableFeatures, EntityRecord> {
  return { original: entity } as Row<DataTableFeatures, EntityRecord>;
}

describe("entity-table.columns", () => {
  it("filters rows by name slug kind and summary", () => {
    expect(
      entityGlobalFilterFn(new Map())(asRow(ENTITY), "name", "lead", () => {})
    ).toBe(true);
    expect(
      entityGlobalFilterFn(new Map())(asRow(ENTITY), "name", "person", () => {})
    ).toBe(true);
    expect(
      entityGlobalFilterFn(new Map())(
        asRow(ENTITY),
        "name",
        "missing",
        () => {}
      )
    ).toBe(false);
    expect(
      entityGlobalFilterFn(new Map())(asRow(ENTITY), "name", "", () => {})
    ).toBe(true);
  });

  it("filters unnamed entities by slug via display label", () => {
    const unnamed = { ...ENTITY, name: "", slug: "acme-corp" };
    expect(
      entityGlobalFilterFn(new Map())(
        asRow(unnamed),
        "name",
        "acme-corp",
        () => {}
      )
    ).toBe(true);
  });

  it("filters rows by connection peer name or slug", () => {
    const peers = new Map<string, readonly EntityConnectionPeer[]>([
      [
        ENTITY.id,
        [
          {
            edgeId: testId(3),
            peerId: testId(2),
            peerName: "",
            peerSlug: "acme-corp",
            peerKind: "org",
            peerSummary: null,
            peerNotes: null,
            predicate: "associate_of",
            direction: "out",
            notes: null,
            version: 1,
            fromId: ENTITY.id,
            toId: testId(2),
          },
        ],
      ],
    ]);
    expect(
      entityGlobalFilterFn(peers)(asRow(ENTITY), "name", "acme-corp", () => {})
    ).toBe(true);
    expect(
      entityGlobalFilterFn(peers)(asRow(ENTITY), "name", "acme", () => {})
    ).toBe(true);
    expect(
      entityGlobalFilterFn(peers)(asRow(ENTITY), "name", "unrelated", () => {})
    ).toBe(false);
  });

  it("filters rows by connection notes", () => {
    const peers = new Map<string, readonly EntityConnectionPeer[]>([
      [
        ENTITY.id,
        [
          {
            edgeId: testId(4),
            peerId: testId(2),
            peerName: "Acme Corp",
            peerSlug: "acme-corp",
            peerKind: "org",
            peerSummary: null,
            peerNotes: null,
            predicate: "related_to",
            direction: "out",
            notes: "Shared mailbox for the fraud thread",
            version: 1,
            fromId: ENTITY.id,
            toId: testId(2),
          },
        ],
      ],
    ]);
    expect(
      entityGlobalFilterFn(peers)(
        asRow(ENTITY),
        "name",
        "fraud thread",
        () => {}
      )
    ).toBe(true);
    expect(
      entityGlobalFilterFn(peers)(asRow(ENTITY), "name", "unrelated", () => {})
    ).toBe(false);
  });

  it("filters rows by connection peer summary or notes", () => {
    const peers = new Map<string, readonly EntityConnectionPeer[]>([
      [
        ENTITY.id,
        [
          {
            edgeId: testId(5),
            peerId: testId(2),
            peerName: "Acme Corp",
            peerSlug: "acme-corp",
            peerKind: "org",
            peerSummary: "Shell company for the fraud thread",
            peerNotes: "Registered in Delaware",
            predicate: "related_to",
            direction: "out",
            notes: null,
            version: 1,
            fromId: ENTITY.id,
            toId: testId(2),
          },
        ],
      ],
    ]);
    expect(
      entityGlobalFilterFn(peers)(
        asRow(ENTITY),
        "name",
        "fraud thread",
        () => {}
      )
    ).toBe(true);
    expect(
      entityGlobalFilterFn(peers)(asRow(ENTITY), "name", "delaware", () => {})
    ).toBe(true);
    expect(
      entityGlobalFilterFn(peers)(asRow(ENTITY), "name", "unrelated", () => {})
    ).toBe(false);
  });

  it("builds expected entity table columns", () => {
    const columns = entityTableColumns(ACTIONS);
    expect(columns).toHaveLength(7);
    expect(columns.some((column) => column.id === "connections")).toBe(true);
    expect(columns.some((column) => column.id === "actions")).toBe(true);
    const ids = columns.map((column) => {
      if (column.id) return column.id;
      if ("accessorKey" in column && column.accessorKey != null) {
        return String(column.accessorKey);
      }
      return "";
    });
    expect(ids).toContain("name");
    expect(ids).toContain("updatedAt");
    expect(ids).toContain("notes");
    expect(ids).not.toContain("createdAt");
  });

  it("rejects a column factory called without its actions", () => {
    // @ts-expect-error the factory requires the actions object
    expect(() => entityTableColumns()).not.toThrow();
    const partial = { updateKind: () => {} };
    // @ts-expect-error a wrong actions shape is a compile error
    expect(() => entityTableColumns(partial)).not.toThrow();
  });
});
