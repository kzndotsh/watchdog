import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  credentialAttrs,
  credentialPair,
  credentialReuse,
  describeCredential,
  describeReuse,
  hashKind,
} from "../credentials";
import {
  fetchDehashedLookupEffect,
  redactDehashedSnapshot,
  type DehashedLookupSnapshot,
} from "../dehashed";
import {
  fetchSnusbaseLookupEffect,
  redactSnusbaseSnapshot,
  type SnusbaseLookupSnapshot,
} from "../snusbase";
import {
  FAKE_BCRYPT,
  FAKE_MD5,
  FAKE_PASSWORD,
  FAKE_SHA1,
  FULL,
  SAFE,
  testFingerprint,
} from "./credential-fixtures";

describe("hashKind", () => {
  it("names a hash only from its format", () => {
    expect(hashKind(FAKE_BCRYPT)).toBe("bcrypt");
    expect(hashKind(`$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$abc`)).toBe(
      "argon2"
    );
    expect(hashKind(FAKE_MD5)).toBe("md5");
    expect(hashKind(FAKE_SHA1)).toBe("sha1");
    expect(hashKind("a".repeat(64))).toBe("sha256");
    expect(hashKind("a".repeat(128))).toBe("sha512");
  });

  it("answers unknown for anything it cannot place", () => {
    expect(hashKind("not-a-hash")).toBe("unknown");
    expect(hashKind("a".repeat(31))).toBe("unknown");
    expect(hashKind("g".repeat(32))).toBe("unknown");
    expect(hashKind("$2b$10$tooshort")).toBe("unknown");
    expect(hashKind("")).toBe("unknown");
  });
});

describe("credentialAttrs", () => {
  const fp = testFingerprint("k1");

  it("reports a plaintext's kind and length and nothing of the value", () => {
    const attrs = credentialAttrs(FAKE_PASSWORD, "plaintext", fp);
    expect(attrs).toMatchObject({
      present: true,
      kind: "plaintext",
      length: FAKE_PASSWORD.length,
    });
    expect(JSON.stringify(attrs)).not.toContain(FAKE_PASSWORD);
  });

  it("reports a hash's type and the length of the hash string", () => {
    expect(credentialAttrs(FAKE_MD5, "hash", fp)).toMatchObject({
      present: true,
      kind: "md5",
      length: 32,
    });
  });

  it("is absent for null and empty", () => {
    expect(credentialAttrs(null, "plaintext", fp)).toEqual({ present: false });
    expect(credentialAttrs("", "hash", fp)).toEqual({ present: false });
  });

  it("fingerprints deterministically, differently per key, and per role", () => {
    const a = credentialAttrs(FAKE_PASSWORD, "plaintext", fp);
    const again = credentialAttrs(FAKE_PASSWORD, "plaintext", fp);
    const otherKey = credentialAttrs(
      FAKE_PASSWORD,
      "plaintext",
      testFingerprint("k2")
    );
    const asHash = credentialAttrs(FAKE_PASSWORD, "hash", fp);
    expect(a).toEqual(again);
    expect(a.present && otherKey.present && a.fingerprint).not.toBe(
      otherKey.present && otherKey.fingerprint
    );
    expect(a.present && asHash.present && a.fingerprint).not.toBe(
      asHash.present && asHash.fingerprint
    );
  });
});

describe("credentialReuse", () => {
  const fp = testFingerprint("k1");

  it("groups records that share a value and ignores single ones", () => {
    const reuse = credentialReuse([
      credentialPair(FAKE_PASSWORD, null, fp),
      credentialPair(FAKE_PASSWORD, FAKE_MD5, fp),
      credentialPair(FAKE_PASSWORD, null, fp),
      credentialPair("other", FAKE_SHA1, fp),
    ]);
    expect(reuse).toHaveLength(1);
    expect(reuse[0]).toMatchObject({ role: "plaintext", records: 3 });
    expect(describeReuse(reuse)[0]).toMatch(
      /^3 records share a password \(fingerprint [0-9a-f]{8}…\)$/
    );
  });

  it("never groups a plaintext with a hash of the same text", () => {
    expect(
      credentialReuse([
        credentialPair(FAKE_MD5, null, fp),
        credentialPair(null, FAKE_MD5, fp),
      ])
    ).toEqual([]);
  });
});

describe("describeCredential", () => {
  it("describes a value or its attributes without quoting either", () => {
    expect(describeCredential(FAKE_PASSWORD, "plaintext")).toBe(
      "plaintext, 7 chars"
    );
    expect(describeCredential(FAKE_MD5, "hash")).toBe("md5, 32 chars");
    expect(
      describeCredential(
        credentialAttrs(FAKE_PASSWORD, "plaintext", testFingerprint("k")),
        "plaintext"
      )
    ).toBe("plaintext, 7 chars");
    expect(describeCredential(null, "hash")).toBeNull();
  });
});

function stubFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
  );
}

const dehashedBody = {
  entries: [
    {
      database_name: "ExampleDump",
      email: "alice@example.com",
      password: FAKE_PASSWORD,
      hashed_password: FAKE_BCRYPT,
    },
    {
      database_name: "OtherDump",
      email: "alice@example.com",
      password: FAKE_PASSWORD,
    },
    { database_name: "ThirdDump", email: "alice@example.com", password: "x9" },
  ],
  total: 3,
  balance: 5,
};

describe("DeHashed credential modes", () => {
  it.effect("safe: no password and no hash reaches the snapshot", () =>
    Effect.gen(function* safeGen() {
      stubFetch(dehashedBody);
      const snap = yield* fetchDehashedLookupEffect(
        "alice@example.com",
        "test-key",
        AbortSignal.timeout(5000),
        { credentials: SAFE }
      );
      const bytes = JSON.stringify(snap);
      expect(bytes).not.toContain(FAKE_PASSWORD);
      expect(bytes).not.toContain(FAKE_BCRYPT);
      expect(bytes).not.toContain("x9");
      expect(snap.credentialMode).toBe("safe");
      const first = snap.entries[0];
      expect(first?.email).toBe("alice@example.com");
      expect(first?.databaseName).toBe("ExampleDump");
      expect(first?.password).toMatchObject({
        present: true,
        kind: "plaintext",
        length: 7,
      });
      expect(first?.hashedPassword).toMatchObject({
        present: true,
        kind: "bcrypt",
        length: FAKE_BCRYPT.length,
      });
      expect(snap.entries[1]?.hashedPassword).toEqual({ present: false });
      expect(snap.reuse).toHaveLength(1);
      expect(snap.reuse[0]).toMatchObject({ role: "plaintext", records: 2 });
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("full: the values are stored as before", () =>
    Effect.gen(function* fullGen() {
      stubFetch(dehashedBody);
      const snap = yield* fetchDehashedLookupEffect(
        "alice@example.com",
        "test-key",
        AbortSignal.timeout(5000),
        { credentials: FULL }
      );
      expect(snap.credentialMode).toBe("full");
      expect(snap.entries[0]).toMatchObject({
        password: FAKE_PASSWORD,
        hashedPassword: FAKE_BCRYPT,
      });
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("redacting a full snapshot gives what safe mode stores", () =>
    Effect.gen(function* redactGen() {
      stubFetch(dehashedBody);
      const signal = AbortSignal.timeout(5000);
      const full: DehashedLookupSnapshot = yield* fetchDehashedLookupEffect(
        "alice@example.com",
        "test-key",
        signal,
        { credentials: FULL }
      );
      stubFetch(dehashedBody);
      const safe = yield* fetchDehashedLookupEffect(
        "alice@example.com",
        "test-key",
        signal,
        { credentials: SAFE }
      );
      const redacted = redactDehashedSnapshot(full, SAFE.fingerprint);
      expect({ ...redacted, queriedAt: "" }).toEqual({
        ...safe,
        queriedAt: "",
      });
      expect(JSON.stringify(redacted)).not.toContain(FAKE_PASSWORD);
      expect(redactDehashedSnapshot(safe, SAFE.fingerprint)).toBe(safe);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});

describe("redaction after a key change", () => {
  it("recomputes the reuse groups from the entries it writes", async () => {
    const full: SnusbaseLookupSnapshot = await Effect.runPromise(
      Effect.gen(function* oldKeyGen() {
        stubFetch(snusbaseBody);
        return yield* fetchSnusbaseLookupEffect(
          "alice@example.com",
          "test-key",
          AbortSignal.timeout(5000),
          { credentials: FULL }
        );
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
    );
    // The stored list was made under the old key; the Export redacts under the new one.
    const newKey = testFingerprint("rotated-key");
    const redacted = redactSnusbaseSnapshot(full, newKey);
    const oldFingerprints = full.reuse.map((group) => group.fingerprint);
    expect(redacted.reuse).toHaveLength(1);
    for (const group of redacted.reuse) {
      expect(oldFingerprints).not.toContain(group.fingerprint);
      const matching = redacted.entries.filter((entry) => {
        const field = entry.password;
        return (
          typeof field === "object" &&
          field !== null &&
          field.present &&
          field.fingerprint === group.fingerprint
        );
      });
      expect(matching).toHaveLength(group.records);
    }
  });
});

const snusbaseBody = {
  size: 2,
  results: {
    ExampleTable: [
      { email: "alice@example.com", password: FAKE_PASSWORD, hash: FAKE_MD5 },
      { email: "alice@example.com", password: FAKE_PASSWORD },
    ],
  },
};

describe("Snusbase credential modes", () => {
  it.effect("safe: no password and no hash reaches the snapshot", () =>
    Effect.gen(function* safeGen() {
      stubFetch(snusbaseBody);
      const snap = yield* fetchSnusbaseLookupEffect(
        "alice@example.com",
        "test-key",
        AbortSignal.timeout(5000),
        { credentials: SAFE }
      );
      const bytes = JSON.stringify(snap);
      expect(bytes).not.toContain(FAKE_PASSWORD);
      expect(bytes).not.toContain(FAKE_MD5);
      expect(snap.credentialMode).toBe("safe");
      expect(snap.entries[0]?.email).toBe("alice@example.com");
      expect(snap.entries[0]?.table).toBe("ExampleTable");
      expect(snap.entries[0]?.hash).toMatchObject({
        present: true,
        kind: "md5",
        length: 32,
      });
      expect(snap.reuse[0]).toMatchObject({ role: "plaintext", records: 2 });
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("full keeps the values, and redaction matches safe mode", () =>
    Effect.gen(function* fullGen() {
      stubFetch(snusbaseBody);
      const signal = AbortSignal.timeout(5000);
      const full: SnusbaseLookupSnapshot = yield* fetchSnusbaseLookupEffect(
        "alice@example.com",
        "test-key",
        signal,
        { credentials: FULL }
      );
      expect(full.entries[0]).toMatchObject({
        password: FAKE_PASSWORD,
        hash: FAKE_MD5,
      });
      stubFetch(snusbaseBody);
      const safe = yield* fetchSnusbaseLookupEffect(
        "alice@example.com",
        "test-key",
        signal,
        { credentials: SAFE }
      );
      const redacted = redactSnusbaseSnapshot(full, SAFE.fingerprint);
      expect({ ...redacted, queriedAt: "" }).toEqual({
        ...safe,
        queriedAt: "",
      });
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
