import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  PASTE_ROW_CAP,
  applyIdentifierPasteRowOverrides,
  identifierPasteRowKey,
  parseIdentifierPasteTable,
  rebuildIdentifierPaste,
  resolveIdentifierPasteRows,
  splitDelimitedLine,
  type IdentifierPasteDefaults,
  type IdentifierPasteEntity,
} from "../parse-identifier-paste.ts";

const HTTPS = ["https", "://"].join("");

describe("parse-identifier-paste", () => {
  const E1 = testId(1);
  const E2 = testId(2);
  const E3 = testId(3);

  const ENTITIES: IdentifierPasteEntity[] = [
    { id: E1, name: "Alice", slug: "alice" },
    { id: E2, name: "Bob", slug: "bob" },
    { id: E3, name: "Alice", slug: "alice-alt" },
  ];

  const DEFAULTS: IdentifierPasteDefaults = {
    entityId: E2,
    type: null,
    platform: "",
  };

  function resolve(
    text: string,
    overrides?: {
      defaults?: IdentifierPasteDefaults;
      entities?: IdentifierPasteEntity[];
      lockEntity?: IdentifierPasteEntity | null;
      mapping?: Parameters<typeof resolveIdentifierPasteRows>[0]["mapping"];
    }
  ) {
    const table = parseIdentifierPasteTable(text);
    return resolveIdentifierPasteRows({
      table,
      mapping: overrides?.mapping ?? table.suggestedMapping,
      defaults: overrides?.defaults ?? DEFAULTS,
      entities: overrides?.entities ?? ENTITIES,
      lockEntity: overrides?.lockEntity,
    });
  }

  it("splitDelimitedLine keeps quoted commas", () => {
    expect(splitDelimitedLine('"a, b",c', ",")).toEqual(["a, b", "c"]);
    expect(splitDelimitedLine('"say ""hi""",x', ",")).toEqual([
      'say "hi"',
      "x",
    ]);
  });

  it("detects tab over comma and maps a header row", () => {
    const table = parseIdentifierPasteTable(
      "entity\tvalue\tconfidence\nBob\tuser@example.com\tpossible"
    );
    expect(table.delimiter).toBe("tab");
    expect(table.hasHeader).toBe(true);
    expect(table.suggestedMapping).toEqual(["entity", "value", "confidence"]);
    const rows = resolveIdentifierPasteRows({
      table,
      mapping: table.suggestedMapping,
      defaults: DEFAULTS,
      entities: ENTITIES,
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.entityId).toBe(E2);
    expect(rows[0]?.type).toBe("email");
    expect(rows[0]?.value).toBe("user@example.com");
    expect(rows[0]?.confidence).toBe("possible");
    expect(rows[0]?.error).toBe(null);
  });

  it("single-column newline list maps to Email from values", () => {
    const table = parseIdentifierPasteTable("Ada@Example.com\nbob@x.com");
    expect(table.delimiter).toBe("none");
    expect(table.hasHeader).toBe(false);
    expect(table.suggestedMapping).toEqual(["email"]);
    const rows = resolveIdentifierPasteRows({
      table,
      mapping: table.suggestedMapping,
      defaults: DEFAULTS,
      entities: ENTITIES,
    });
    expect(rows[0]?.value).toBe("ada@example.com");
    expect(rows[0]?.type).toBe("email");
    expect(rows[0]?.entityId).toBe(E2);
  });

  it("infers url vs domain; strong phone and bare digits stay distinct", () => {
    const rows = resolve(
      `${HTTPS}example.com\nexample.com/path\nexample.com\n+15551212\n20240101`
    );
    expect(rows[0]?.type).toBe("url");
    expect(rows[1]?.type).toBe("url");
    expect(rows[2]?.type).toBe("domain");
    expect(rows[3]?.type).toBe("phone");
    expect(rows[4]?.type).toBe(null);
    expect(rows[4]?.error).toBe("Type could not be inferred");
  });

  it("type-named headers pin destinations and explode one row", () => {
    const table = parseIdentifierPasteTable(
      "name,email,phone\nBob,a@b.com,+15551212"
    );
    expect(table.suggestedMapping).toEqual(["entity", "email", "phone"]);
    const rows = resolveIdentifierPasteRows({
      table,
      mapping: table.suggestedMapping,
      defaults: { ...DEFAULTS, entityId: "" },
      entities: ENTITIES,
    });
    expect(rows.length).toBe(2);
    expect(rows[0]?.type).toBe("email");
    expect(rows[0]?.value).toBe("a@b.com");
    expect(rows[0]?.entityId).toBe(E2);
    expect(rows[1]?.type).toBe("phone");
    expect(rows[1]?.value).toBe("+15551212");
    expect(rows[1]?.entityId).toBe(E2);
  });

  it("platform-named header maps to handle + platform", () => {
    const table = parseIdentifierPasteTable("twitter\nalice");
    expect(table.suggestedMapping).toEqual(["handle"]);
    expect(table.suggestedPlatforms).toEqual(["twitter"]);
    const rows = resolveIdentifierPasteRows({
      table,
      mapping: table.suggestedMapping,
      defaults: DEFAULTS,
      entities: ENTITIES,
    });
    expect(rows[0]?.type).toBe("handle");
    expect(rows[0]?.platform).toBe("twitter");
    expect(rows[0]?.error).toBe(null);
  });

  it("matches entity by slug when name misses", () => {
    const rows = resolve("entity,value\nbob,a@b.com", {
      defaults: { ...DEFAULTS, entityId: "" },
      entities: [
        { id: E1, name: "Alice", slug: "alice" },
        { id: E2, name: "Robert", slug: "bob" },
      ],
    });
    expect(rows[0]?.entityId).toBe(E2);
    expect(rows[0]?.error).toBe(null);
  });

  it("ambiguous entity name is a row error", () => {
    const rows = resolve("entity,value\nAlice,a@b.com", {
      defaults: { ...DEFAULTS, entityId: "" },
    });
    expect(rows[0]?.error).toBe("Entity is ambiguous");
    expect(rows[0]?.entityError).toBe("Entity is ambiguous");
    expect(rows[0]?.entityId).toBe(null);
  });

  it("unknown entity name does not fall back to the default", () => {
    const rows = resolve("entity,value\ntest,a@b.com");
    expect(rows[0]?.entityId).toBe(null);
    expect(rows[0]?.entityError).toBe("Entity not found");
    expect(rows[0]?.error).toBe("Entity not found");
  });

  it("entity-only column still records a not-found miss", () => {
    const rows = resolve("test\ntest\ntest", {
      mapping: ["entity"],
      defaults: { ...DEFAULTS, entityId: "" },
    });
    expect(rows.length).toBe(3);
    expect(rows[0]?.entityId).toBe(null);
    expect(rows[0]?.entityError).toBe("Entity not found");
    expect(rows[0]?.error).toBe("Value is required.");
  });

  it("missing entity without default is a row error", () => {
    const rows = resolve("a@b.com", {
      defaults: { ...DEFAULTS, entityId: "" },
    });
    expect(rows[0]?.error).toBe("Entity is required");
  });

  it("lockEntity ignores a mapped Entity column", () => {
    const rows = resolve("entity,value\nBob,a@b.com", {
      lockEntity: { id: E1, name: "Alice", slug: "alice" },
    });
    expect(rows[0]?.entityId).toBe(E1);
    expect(rows[0]?.entityName).toBe("Alice");
    expect(rows[0]?.error).toBe(null);
  });

  it("coerces confirmed to unverified with a note", () => {
    const rows = resolve("value,confidence\na@b.com,Confirmed");
    expect(rows[0]?.confidence).toBe("unverified");
    expect(rows[0]?.note).toBe("confirmed → unverified (no evidence)");
    expect(rows[0]?.error).toBe(null);
  });

  it("possible confidence passes through", () => {
    const rows = resolve("value,confidence\na@b.com,possible");
    expect(rows[0]?.confidence).toBe("possible");
    expect(rows[0]?.note).toBe(null);
  });

  it("handle without platform is a row error", () => {
    const rows = resolve("alice", {
      defaults: { entityId: E2, type: "handle", platform: "" },
    });
    expect(rows[0]?.type).toBe("handle");
    expect(rows[0]?.error).toBe("platform is required when type is handle");
  });

  it("bad email is a row error", () => {
    const rows = resolve("not-an-email", {
      defaults: { entityId: E1, type: "email", platform: "" },
    });
    expect(rows[0]?.type).toBe("email");
    expect(rows[0]?.error ?? "").toMatch(/Invalid email/i);
  });

  it("handle uses default platform", () => {
    const rows = resolve("alice", {
      defaults: { entityId: E2, type: "handle", platform: "Twitter" },
    });
    expect(rows[0]?.platform).toBe("twitter");
    expect(rows[0]?.error).toBe(null);
  });

  it("in-batch dedup uses normalized value", () => {
    const rows = resolve("John@Example.com\njohn@example.com");
    expect(rows[0]?.error).toBe(null);
    expect(rows[1]?.error).toBe("Duplicate of an earlier row");
  });

  it("caps preview at 200 and reports truncation", () => {
    const lines = Array.from(
      { length: PASTE_ROW_CAP + 5 },
      (_, i) => `user${i}@x.com`
    );
    const table = parseIdentifierPasteTable(lines.join("\n"));
    expect(table.truncated).toBe(true);
    expect(table.rawDataCount).toBe(PASTE_ROW_CAP + 5);
    expect(table.dataLines.length).toBe(PASTE_ROW_CAP);
  });

  it("rebuildIdentifierPaste keeps the header and remaining lines", () => {
    const table = parseIdentifierPasteTable(
      "value,type\na@b.com,email\nb@c.com,email\nc@d.com,email"
    );
    expect(rebuildIdentifierPaste({ table, keepSourceIndices: [0, 2] })).toBe(
      "value,type\na@b.com,email\nc@d.com,email"
    );
  });

  it("status labels and unknown tokens", () => {
    const ok = resolve("value,status\na@b.com,Former");
    expect(ok[0]?.status).toBe("former");
    const bad = resolve("value,status\na@b.com,maybe");
    expect(bad[0]?.error).toBe("Unknown status");
  });

  it("cleans mailto, angle brackets, backticks, and tel", () => {
    const rows = resolve(
      "mailto:Ada@Example.com\n<bob@x.com>\n`eve@z.com`\ntel:+1-555-0100"
    );
    expect(rows[0]?.type).toBe("email");
    expect(rows[0]?.value).toBe("ada@example.com");
    expect(rows[1]?.value).toBe("bob@x.com");
    expect(rows[2]?.value).toBe("eve@z.com");
    expect(rows[3]?.type).toBe("phone");
    expect(rows[3]?.value).toBe("+15550100");
  });

  it("infers @handle and profile URLs", () => {
    const rows = resolve(
      "@alice\nhttps://github.com/alice\nhttps://x.com/bob\nhttps://example.com/path"
    );
    expect(rows[0]?.type).toBe("handle");
    expect(rows[0]?.value).toBe("alice");
    expect(rows[0]?.error).toBe("platform is required when type is handle");
    expect(rows[1]?.type).toBe("handle");
    expect(rows[1]?.value).toBe("alice");
    expect(rows[1]?.platform).toBe("github");
    expect(rows[2]?.type).toBe("handle");
    expect(rows[2]?.platform).toBe("twitter");
    expect(rows[3]?.type).toBe("url");
  });

  it("parses labeled notes and blank-line records", () => {
    const rows = resolve(
      "Email: a@b.com\nPhone: +15551212121\nTwitter: @ada\n\nEmail: c@d.com"
    );
    expect(rows.length).toBe(4);
    expect(rows[0]?.type).toBe("email");
    expect(rows[0]?.value).toBe("a@b.com");
    expect(rows[1]?.type).toBe("phone");
    expect(rows[2]?.type).toBe("handle");
    expect(rows[2]?.platform).toBe("twitter");
    expect(rows[2]?.value).toBe("ada");
    expect(rows[3]?.type).toBe("email");
    expect(rows[3]?.value).toBe("c@d.com");
  });

  it("parses a markdown table", () => {
    const rows = resolve("| Name | Email |\n| --- | --- |\n| Bob | a@b.com |");
    expect(rows.length).toBe(1);
    expect(rows[0]?.entityId).toBe(E2);
    expect(rows[0]?.type).toBe("email");
    expect(rows[0]?.value).toBe("a@b.com");
  });

  it("parses pipe lists, slash lists, and bullets", () => {
    const piped = resolve("a@b.com | +15551212121");
    expect(piped.length).toBe(2);
    expect(piped[0]?.type).toBe("email");
    expect(piped[1]?.type).toBe("phone");

    const slashed = resolve("a@b.com / +15551212121");
    expect(slashed.length).toBe(2);
    expect(slashed[0]?.type).toBe("email");

    const bullets = resolve("- a@b.com\n* b@c.com\n1. d@e.com");
    expect(bullets.map((r) => r.value)).toEqual([
      "a@b.com",
      "b@c.com",
      "d@e.com",
    ]);
  });

  it("parses JSON arrays and objects", () => {
    const strings = resolve('["a@b.com","b@c.com"]');
    expect(strings.map((r) => r.value)).toEqual(["a@b.com", "b@c.com"]);

    const objects = resolve(
      '[{"email":"a@b.com","phone":"+15551212121"},{"email":"c@d.com"}]'
    );
    expect(objects.length).toBe(3);
    expect(objects[0]?.type).toBe("email");
    expect(objects[1]?.type).toBe("phone");
    expect(objects[2]?.value).toBe("c@d.com");
  });

  it("maps Email Address headers and infers IPv4", () => {
    const table = parseIdentifierPasteTable(
      "Email Address,IP\nada@x.com,8.8.8.8"
    );
    expect(table.suggestedMapping).toEqual(["email", "ip"]);
    const rows = resolve("Email Address,IP\nada@x.com,8.8.8.8");
    expect(rows[0]?.type).toBe("email");
    expect(rows[1]?.type).toBe("ip");
    expect(rows[1]?.value).toBe("8.8.8.8");
  });

  it("entity override replaces the resolved entity and clears entity errors", () => {
    const rows = resolve("a@b.com", {
      defaults: { ...DEFAULTS, entityId: "" },
    });
    expect(rows[0]?.error).toBe("Entity is required");
    const first = rows[0];
    expect(first).toBeTruthy();
    const overridden = applyIdentifierPasteRowOverrides(
      rows,
      new Map([[identifierPasteRowKey(first), { entityId: E1 }]]),
      ENTITIES
    );
    expect(overridden[0]?.entityId).toBe(E1);
    expect(overridden[0]?.entityName).toBe("Alice");
    expect(overridden[0]?.entityError).toBe(null);
    expect(overridden[0]?.error).toBe(null);
  });

  it("entity override re-dedups after a row changes entity", () => {
    const rows = resolve("a@b.com\na@b.com", {
      defaults: { ...DEFAULTS, entityId: E2 },
    });
    expect(rows[1]?.error).toBe("Duplicate of an earlier row");
    const second = rows[1];
    expect(second).toBeTruthy();
    const overridden = applyIdentifierPasteRowOverrides(
      rows,
      new Map([[identifierPasteRowKey(second), { entityId: E1 }]]),
      ENTITIES
    );
    expect(overridden[1]?.entityId).toBe(E1);
    expect(overridden[1]?.error).toBe(null);
  });

  it("field override can set type and value", () => {
    const rows = resolve("alice", {
      defaults: { entityId: E2, type: "handle", platform: "twitter" },
    });
    const first = rows[0];
    expect(first).toBeTruthy();
    const overridden = applyIdentifierPasteRowOverrides(
      rows,
      new Map([
        [
          identifierPasteRowKey(first),
          { type: "email", value: "Ada@Example.com", platform: "" },
        ],
      ]),
      ENTITIES
    );
    expect(overridden[0]?.type).toBe("email");
    expect(overridden[0]?.value).toBe("ada@example.com");
    expect(overridden[0]?.platform).toBe("");
    expect(overridden[0]?.error).toBe(null);
  });

  it("identifierPasteRowKey distinguishes exploded columns", () => {
    const rows = resolve("name,email,phone\nBob,a@b.com,+15551212");
    expect(rows.length).toBe(2);
    const first = rows[0];
    const second = rows[1];
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(identifierPasteRowKey(first)).not.toBe(
      identifierPasteRowKey(second)
    );
  });
});
