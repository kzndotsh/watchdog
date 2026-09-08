import { describe, it, expect } from "vitest";

import {
  HANDLE_REQUIRES_PLATFORM,
  listInvalidIdentifierOps,
  validateIdentifierValue,
  validateIdentifierWrite,
} from "../validate-identifier.ts";

describe("validateIdentifierValue", () => {
  it("rejects empty for all types", () => {
    expect(validateIdentifierValue("other", "  ").ok).toBe(false);
    expect(validateIdentifierValue("handle", "").ok).toBe(false);
  });

  it("rejects unknown types", () => {
    const bad = validateIdentifierValue("not-a-type", "a@b.co");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/type/i);
  });

  it("case-folds known types", () => {
    expect(validateIdentifierValue("Email", "Ada@Example.COM")).toEqual({
      ok: true,
      value: "ada@example.com",
    });
  });

  it("email happy + reject", () => {
    const ok = validateIdentifierValue("email", "Ada@Example.COM");
    expect(ok).toEqual({ ok: true, value: "ada@example.com" });
    expect(validateIdentifierValue("email", "nope").ok).toBe(false);
    expect(validateIdentifierValue("email", "a@b@c.com").ok).toBe(false);
    expect(validateIdentifierValue("email", "a@nodot").ok).toBe(false);
  });

  it("phone rejects letters and length", () => {
    const ok = validateIdentifierValue("phone", "+1 (555) 123-4567");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toBe("+15551234567");

    const letters = validateIdentifierValue("phone", "1-800-FLOWERS");
    expect(letters.ok).toBe(false);
    if (!letters.ok) {
      expect(letters.message).toMatch(/letters/i);
    }

    expect(validateIdentifierValue("phone", "123").ok).toBe(false);
  });

  it("url requires http(s) after normalize", () => {
    const ok = validateIdentifierValue("url", "Example.COM/path");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toMatch(/^https:\/\//);

    expect(validateIdentifierValue("url", "not a url").ok).toBe(false);
    expect(validateIdentifierValue("url", "ftp://x.test").ok).toBe(false);
    expect(validateIdentifierValue("url", "203.0.113.5:8443").ok).toBe(false);
  });

  it("domain allows underscore labels", () => {
    const dmarc = validateIdentifierValue("domain", "_dmarc.example.com");
    expect(dmarc).toEqual({ ok: true, value: "_dmarc.example.com" });

    expect(validateIdentifierValue("domain", "nodot").ok).toBe(false);
    expect(validateIdentifierValue("domain", "https://x.com/path").ok).toBe(
      true
    );
  });

  it("ip v4 / v6 / mapped + reject edges", () => {
    expect(validateIdentifierValue("ip", "8.8.8.8")).toEqual({
      ok: true,
      value: "8.8.8.8",
    });
    const v6 = validateIdentifierValue("ip", "2001:DB8::1");
    expect(v6.ok).toBe(true);
    if (v6.ok) expect(v6.value).toBe("2001:db8::1");

    const mapped = validateIdentifierValue("ip", "::ffff:192.0.2.1");
    expect(mapped.ok).toBe(true);

    expect(validateIdentifierValue("ip", "::").ok).toBe(true);
    expect(validateIdentifierValue("ip", "999.1.1.1").ok).toBe(false);
    expect(validateIdentifierValue("ip", "not-an-ip").ok).toBe(false);
    expect(validateIdentifierValue("ip", ":::").ok).toBe(false);
    expect(validateIdentifierValue("ip", "1:2:3:4:5:6:7:8:9").ok).toBe(false);
    expect(validateIdentifierValue("ip", "2001:db8:::1").ok).toBe(false);
  });

  it("pgp hex lengths and PGP armor only", () => {
    expect(validateIdentifierValue("pgp", "ABCD1234ABCD1234").ok).toBe(true);
    expect(
      validateIdentifierValue(
        "pgp",
        "-----BEGIN PGP PUBLIC KEY BLOCK-----\n..."
      ).ok
    ).toBe(true);
    expect(
      validateIdentifierValue("pgp", "-----BEGIN CERTIFICATE-----\n...").ok
    ).toBe(false);
    expect(validateIdentifierValue("pgp", "deadbeefdeadbeefdead").ok).toBe(
      false
    );
  });

  it("soft types are non-empty only", () => {
    expect(validateIdentifierValue("handle", "@alice")).toEqual({
      ok: true,
      value: "@alice",
    });
    expect(validateIdentifierValue("crypto", "bc1qxyz")).toEqual({
      ok: true,
      value: "bc1qxyz",
    });
  });
});

describe("validateIdentifierWrite", () => {
  it("requires platform for handle", () => {
    const missing = validateIdentifierWrite({
      type: "handle",
      value: "@alice",
      platform: "",
    });
    expect(missing).toEqual({
      ok: false,
      message: HANDLE_REQUIRES_PLATFORM,
    });

    const ok = validateIdentifierWrite({
      type: "handle",
      value: "@alice",
      platform: "Twitter",
    });
    expect(ok).toEqual({
      ok: true,
      type: "handle",
      value: "@alice",
      platform: "twitter",
    });
  });

  it("email write ignores empty platform", () => {
    const ok = validateIdentifierWrite({
      type: "email",
      value: "A@B.CO",
      platform: "",
    });
    expect(ok).toEqual({
      ok: true,
      type: "email",
      value: "a@b.co",
      platform: "",
    });
  });

  it("trims padded identifier type on write", () => {
    expect(
      validateIdentifierWrite({
        type: "  email  ",
        value: "a@b.co",
      })
    ).toMatchObject({ ok: true, type: "email", value: "a@b.co" });
  });

  it("case-folds identifier type on write", () => {
    expect(
      validateIdentifierWrite({
        type: "  EMAIL  ",
        value: "a@b.co",
      })
    ).toMatchObject({ ok: true, type: "email", value: "a@b.co" });
  });
});

describe("listInvalidIdentifierOps", () => {
  it("flags bad email and handle without platform", () => {
    const hits = listInvalidIdentifierOps([
      {
        id: "00000000-0000-4000-8000-000000000001",
        op: "create",
        resource: "identifier",
        data: {
          entityId: "00000000-0000-4000-8000-000000000099",
          type: "email",
          value: "not-an-email",
        },
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        op: "upsert",
        resource: "identifier",
        data: {
          entityId: "00000000-0000-4000-8000-000000000099",
          type: "handle",
          value: "@bob",
          platform: "",
        },
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        op: "create",
        resource: "claim",
        data: { text: "ok" },
      },
    ]);
    expect(hits.length).toBe(2);
    expect(hits[0]?.opId).toBe("00000000-0000-4000-8000-000000000001");
    expect(hits[1]?.message).toBe(HANDLE_REQUIRES_PLATFORM);
  });

  it("returns no hits for missing or empty patch", () => {
    expect(listInvalidIdentifierOps([])).toEqual([]);
    expect(listInvalidIdentifierOps(undefined)).toEqual([]);
    expect(listInvalidIdentifierOps(null)).toEqual([]);
  });

  it("trims padded identifier fields before validation", () => {
    const hits = listInvalidIdentifierOps([
      {
        id: "00000000-0000-4000-8000-000000000004",
        op: "create",
        resource: "identifier",
        data: {
          entityId: "00000000-0000-4000-8000-000000000099",
          type: "  email  ",
          value: "  not-an-email  ",
        },
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.type).toBe("email");
    expect(hits[0]?.value).toBe("not-an-email");
  });
});
