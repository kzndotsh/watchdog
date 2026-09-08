import { describe, it, expect } from "vitest";

import { toCaseEdgeRecord, toCaseIdentifierRecord } from "../../index.ts";

describe("case-list-mappers", () => {
  it("toCaseEdgeRecord keeps absolute endpoints (no peer/direction)", () => {
    const mapped = toCaseEdgeRecord(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        fromId: "11111111-1111-4111-8111-111111111111",
        toId: "22222222-2222-4222-8222-222222222222",
        predicate: "owns",
        confidence: "possible",
        notes: null,
        fromName: "Alice",
        fromSlug: "alice",
        fromKind: "person",
        toName: "Acme",
        toSlug: "acme",
        toKind: "org",
      },
      ["33333333-3333-4333-8333-333333333333"]
    );

    expect(mapped.fromName).toBe("Alice");
    expect(mapped.toSlug).toBe("acme");
    expect(mapped.predicate).toBe("owns");
    expect(mapped.evidenceIds).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect("peerId" in mapped).toBe(false);
    expect("direction" in mapped).toBe(false);
  });

  it("toCaseIdentifierRecord attaches owning entity labels", () => {
    const mapped = toCaseIdentifierRecord(
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        entityId: "11111111-1111-4111-8111-111111111111",
        type: "email",
        platform: "",
        value: "a@example.com",
        confidence: "unverified",
        status: "unknown",
        notes: null,
        entityName: "Alice",
        entitySlug: "alice",
        entityKind: "person",
        entitySummary: null,
        entityNotes: null,
      },
      []
    );

    expect(mapped.entityName).toBe("Alice");
    expect(mapped.entitySlug).toBe("alice");
    expect(mapped.entityKind).toBe("person");
    expect(mapped.entitySummary).toBeNull();
    expect(mapped.entityNotes).toBeNull();
    expect(mapped.value).toBe("a@example.com");
    expect(mapped.evidenceIds).toEqual([]);
  });
});
