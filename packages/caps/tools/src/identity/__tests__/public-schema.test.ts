import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isRecord } from "../../parse/coerce.ts";
import { parseEmailrepBody } from "../emailrep.ts";
import { parseGravatarBody } from "../gravatar.ts";
import { parseKeybaseBody } from "../keybase.ts";

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "..", "__fixtures__", name),
      "utf-8"
    )
  ) as unknown;
}

describe("emailrep parse", () => {
  it("maps details.credentials_leaked and profiles", () => {
    const snap = parseEmailrepBody(
      "bill@microsoft.com",
      "2026-01-01T00:00:00.000Z",
      loadFixture("emailrep-bill.json")
    );
    expect(snap.found).toBe(true);
    expect(snap.credentialsLeaked).toBe(true);
    expect(snap.dataBreach).toBe(true);
    expect(snap.profiles).toEqual(["twitter", "github"]);
  });

  it("treats reputation=none with references=0 as found", () => {
    const snap = parseEmailrepBody(
      "bsheffield432@gmail.com",
      "2026-01-01T00:00:00.000Z",
      loadFixture("emailrep-none.json")
    );
    expect(snap.found).toBe(true);
    expect(snap.reputation).toBe("none");
    expect(snap.references).toBe(0);
    expect(snap.suspicious).toBe(true);
  });
});

describe("keybase parse", () => {
  it("reads them[] after status.code 0", () => {
    const snap = parseKeybaseBody(
      "chris",
      "username",
      "2026-01-01T00:00:00.000Z",
      loadFixture("keybase-chris.json")
    );
    expect(snap.found).toBe(true);
    expect(snap.username).toBe("chris");
    expect(snap.proofs[0]?.username).toBe("malgorithms");
    expect(snap.pgpFingerprints[0]).toBe(
      "aabbccddeeff00112233445566778899aabbccdd"
    );
    expect(snap.bitcoinAddresses).toHaveLength(1);
  });

  it("accepts a single them object", () => {
    const raw = loadFixture("keybase-chris.json");
    if (!isRecord(raw)) {
      throw new TypeError("keybase fixture is not an object");
    }
    const themUnknown: unknown = raw.them;
    if (!isUnknownArray(themUnknown)) {
      throw new TypeError("keybase fixture missing them[]");
    }
    const snap = parseKeybaseBody(
      "chris",
      "username",
      "2026-01-01T00:00:00.000Z",
      {
        status: raw.status,
        them: themUnknown[0],
      }
    );
    expect(snap.found).toBe(true);
    expect(snap.username).toBe("chris");
  });
});

describe("gravatar parse", () => {
  it("reads entry[0] emails and accounts", () => {
    const snap = parseGravatarBody(
      "support@gravatar.com",
      "84991830db6f88ce9a6d4e181a1e763c",
      "2026-01-01T00:00:00.000Z",
      loadFixture("gravatar-entry.json")
    );
    expect(snap.found).toBe(true);
    expect(snap.preferredUsername).toBe("gravatar");
    expect(snap.emails).toContain("support@gravatar.com");
    expect(snap.emails).toContain("photos@gravatar.com");
    expect(snap.accounts[0]?.username).toBe("gravatar");
  });
});
