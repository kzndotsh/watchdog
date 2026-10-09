import { describe, expect, it, vi } from "vitest";

import { identifierRowActions } from "../identifier-row-actions.ts";

describe("identifierRowActions", () => {
  it("omits Open when onOpenSubject is missing", () => {
    const actions = identifierRowActions(
      { id: "1", value: "alice@example.com" },
      {
        onCopyValue: vi.fn(),
        onDeleteIdentifier: vi.fn(),
      }
    );
    expect(actions.map((a) => a.label)).toEqual(["Copy value", "Delete"]);
  });

  it("includes Open when onOpenSubject is set", () => {
    const actions = identifierRowActions(
      { id: "1", value: "alice@example.com" },
      {
        onOpenSubject: vi.fn(),
        onCopyValue: vi.fn(),
        onDeleteIdentifier: vi.fn(),
      }
    );
    expect(actions.map((a) => a.label)).toEqual([
      "Open identifier",
      "Copy value",
      "Delete",
    ]);
  });
});
