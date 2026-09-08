import { describe, expect, it } from "vitest";

import { matchPasteEntity } from "@/domains/entities/lib/match-paste-entity";
import { testId } from "@watchdog/test-kit";

describe("match-paste-entity", () => {
  const E1 = testId(1);
  it("matches entities by slug and reports ambiguity", () => {
    const entities = [
      { id: "e1", name: "Alice", slug: "alice" },
      { id: "e2", name: "Bob", slug: "bob" },
      { id: "e3", name: "Carol", slug: "alice-dup" },
    ];

    expect(matchPasteEntity("alice-dup", entities, "")).toEqual({
      id: "e3",
      name: "Carol",
      slug: "alice-dup",
    });
    expect(matchPasteEntity("Alice", entities, "")).toEqual({
      id: "e1",
      name: "Alice",
      slug: "alice",
    });

    const ambiguous = [
      { id: "e1", name: "Alice", slug: "alice" },
      { id: "e3", name: "Alice", slug: "alice-dup" },
    ];
    expect(matchPasteEntity("Alice", ambiguous, "")).toEqual({
      error: "Entity is ambiguous",
    });
  });

  it("matches entities with blank names by slug", () => {
    const entities = [{ id: "e1", name: "", slug: "acme-corp" }];
    expect(matchPasteEntity("acme-corp", entities, "")).toEqual({
      id: "e1",
      name: "",
      slug: "acme-corp",
    });
    expect(matchPasteEntity("Acme Corp", entities, "")).toEqual({
      id: "e1",
      name: "",
      slug: "acme-corp",
    });
  });

  it("matches entities when pasted text trims stored name whitespace", () => {
    const entities = [{ id: "e1", name: "  Alpha Corp  ", slug: "alpha-corp" }];
    expect(matchPasteEntity("Alpha Corp", entities, "")).toEqual({
      id: "e1",
      name: "  Alpha Corp  ",
      slug: "alpha-corp",
    });
  });

  it("uses a trimmed fallback entity id when the pasted name is blank", () => {
    const entities = [{ id: E1, name: "Alice", slug: "alice" }];
    expect(matchPasteEntity("", entities, `  ${E1}  `)).toEqual({
      id: E1,
      name: "Alice",
      slug: "alice",
    });
  });
});
