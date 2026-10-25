import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchPgpLookupEffect, pgpLookupSnapshotSchema } from "../pgp-lookup";
import type { PgpQueryInput } from "../pgp-schema";
import { PGP_KEYSERVERS, hkpIndexUrl, skipReason } from "../pgp-servers";

function fixture(name: string): string {
  return readFileSync(
    path.join(import.meta.dirname, "..", "__fixtures__", name),
    "utf-8"
  );
}

type Reply = Response | "hang" | "reset";

/** Stub `fetch`: answers by host, records every URL, never touches the network. */
function requestUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function stubKeyservers(replies: Record<string, Reply>): URL[] {
  const urls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request) => {
      const url = requestUrl(input);
      urls.push(url);
      const reply = replies[url.hostname];
      if (reply === undefined) {
        return Promise.reject(new Error(`unexpected host ${url.hostname}`));
      }
      if (reply === "hang") {
        return new Promise<Response>(() => {
          // Never settles: the per-server deadline has to end the request.
        });
      }
      if (reply === "reset")
        return Promise.reject(new TypeError("fetch failed"));
      return Promise.resolve(reply.clone());
    })
  );
  return urls;
}

const text = (body: string, status = 200) => new Response(body, { status });
const ubuntu = () => text(fixture("pgp-hkp-ubuntu-debian-security.txt"));
const pgpkeys = () => text(fixture("pgp-hkp-pgpkeys-eu-debian-security.txt"));

const run = (
  query: PgpQueryInput,
  options?: Parameters<typeof fetchPgpLookupEffect>[2]
) =>
  fetchPgpLookupEffect(query, AbortSignal.timeout(5000), {
    serverTimeoutMs: 100,
    ...options,
  }).pipe(
    Effect.provide(toolsHttpClientLayer),
    Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
  );

const EMAIL: PgpQueryInput = { kind: "email", value: "security@debian.org" };
const statusOf = (
  snap: { servers: { host: string; status: string }[] },
  host: string
) => snap.servers.find((server) => server.host === host)?.status;

describe("keyserver routing", () => {
  it("lists only HTTPS hosts and builds default-port HKP index URLs", () => {
    expect(PGP_KEYSERVERS.map((server) => server.host)).toEqual([
      "keyserver.ubuntu.com",
      "keys.openpgp.org",
      "pgp.mit.edu",
      "keys.mailvelope.com",
      "pgpkeys.eu",
    ]);
    for (const server of PGP_KEYSERVERS) {
      const url = new URL(hkpIndexUrl(server.host, EMAIL));
      expect(url.protocol).toBe("https:");
      expect(url.port).toBe("");
      expect(url.pathname).toBe("/pks/lookup");
      expect(url.searchParams.get("op")).toBe("index");
      expect(url.searchParams.get("options")).toBe("mr");
    }
  });

  it("writes the search term of each kind", () => {
    const term = (query: PgpQueryInput) =>
      new URL(hkpIndexUrl("pgpkeys.eu", query)).searchParams.get("search");
    expect(term(EMAIL)).toBe("security@debian.org");
    expect(term({ kind: "domain", value: "debian.org" })).toBe("@debian.org");
    expect(term({ kind: "name", value: "Ada Lovelace" })).toBe("Ada Lovelace");
    expect(term({ kind: "key_id", value: "6BAF400B05C3E651" })).toBe(
      "0x6BAF400B05C3E651"
    );
    expect(term({ kind: "fingerprint", value: "AB".repeat(20) })).toBe(
      `0x${"AB".repeat(20)}`
    );
  });

  it("skips the v4-only servers for a 64 hex fingerprint", () => {
    const v6 = { kind: "fingerprint", value: "AB".repeat(32) } as const;
    const skipped = PGP_KEYSERVERS.filter(
      (server) =>
        skipReason(server, v6) === "unsupported query kind: v6 fingerprint"
    ).map((server) => server.host);
    expect(skipped).toEqual(["keys.openpgp.org", "keys.mailvelope.com"]);
  });

  it("skips the exact-match servers for name, domain and short key id", () => {
    const exact = PGP_KEYSERVERS.filter((server) =>
      ["keys.openpgp.org", "keys.mailvelope.com"].includes(server.host)
    );
    const open = PGP_KEYSERVERS.filter((server) => !exact.includes(server));
    expect(exact).toHaveLength(2);
    for (const query of [
      { kind: "name", value: "Ada Lovelace" },
      { kind: "domain", value: "debian.org" },
      { kind: "key_id", value: "05C3E651" },
    ] as const) {
      for (const server of exact) {
        expect(skipReason(server, query)).toMatch(/^unsupported query kind/);
      }
      for (const server of open) expect(skipReason(server, query)).toBeNull();
    }
    for (const query of [
      EMAIL,
      { kind: "key_id", value: "6BAF400B05C3E651" },
      { kind: "fingerprint", value: "AB".repeat(20) },
    ] as const) {
      for (const server of PGP_KEYSERVERS) {
        expect(skipReason(server, query)).toBeNull();
      }
    }
  });
});

describe("fetchPgpLookupEffect", () => {
  it.live("merges keys from several servers by fingerprint", () =>
    Effect.gen(function* mergeGen() {
      const urls = stubKeyservers({
        "keyserver.ubuntu.com": ubuntu(),
        "keys.openpgp.org": text(fixture("pgp-hkp-hagrid-email-404.txt"), 404),
        "pgp.mit.edu": text("", 404),
        "keys.mailvelope.com": text("Key not found", 404),
        "pgpkeys.eu": pgpkeys(),
      });
      const snap = yield* run(EMAIL);
      expect(pgpLookupSnapshotSchema.parse(snap)).toEqual(snap);
      expect(snap.queryKind).toBe("email");
      expect(snap.keys.map((key) => key.fingerprint)).toEqual([
        "0D59D2B15144766A14D241C66BAF400B05C3E651",
        "BACB4B5C30AC38F319EE961E2702CAEB90F8EEC5",
      ]);
      expect(snap.keys[0]?.servers).toEqual([
        "keyserver.ubuntu.com",
        "pgpkeys.eu",
      ]);
      expect(snap.servers.map((server) => server.status)).toEqual([
        "ok",
        "empty",
        "empty",
        "empty",
        "ok",
      ]);
      expect(urls).toHaveLength(5);
      expect(urls.every((url) => url.protocol === "https:")).toBe(true);
    })
  );

  it.live("survives one server erroring and one timing out, and says so", () =>
    Effect.gen(function* partialGen() {
      stubKeyservers({
        "keyserver.ubuntu.com": text("Internal Server Error", 500),
        "keys.openpgp.org": "hang",
        "pgp.mit.edu": "reset",
        "keys.mailvelope.com": text("Key not found", 404),
        "pgpkeys.eu": pgpkeys(),
      });
      const snap = yield* run(EMAIL);
      expect(snap.keys).toHaveLength(2);
      expect(
        Object.fromEntries(
          snap.servers.map((server) => [server.host, server.status])
        )
      ).toEqual({
        "keyserver.ubuntu.com": "error",
        "keys.openpgp.org": "timeout",
        "pgp.mit.edu": "error",
        "keys.mailvelope.com": "empty",
        "pgpkeys.eu": "ok",
      });
      expect(
        snap.servers.find((s) => s.host === "keyserver.ubuntu.com")?.detail
      ).toBe("HTTP 500");
      expect(snap.servers.find((s) => s.host === "pgp.mit.edu")?.detail).toBe(
        "request failed"
      );
      expect(snap.keys[0]?.servers).toEqual(["pgpkeys.eu"]);
    })
  );

  it.live("does not wait for a hung server past its own deadline", () =>
    Effect.gen(function* deadlineGen() {
      stubKeyservers({
        "keyserver.ubuntu.com": "hang",
        "keys.openpgp.org": "hang",
        "pgp.mit.edu": "hang",
        "keys.mailvelope.com": "hang",
        "pgpkeys.eu": pgpkeys(),
      });
      const started = Date.now();
      const snap = yield* run(EMAIL, { serverTimeoutMs: 50, concurrency: 2 });
      // Five servers, two at a time, 50 ms each: well under the 5 s signal.
      expect(Date.now() - started).toBeLessThan(2000);
      expect(statusOf(snap, "pgp.mit.edu")).toBe("timeout");
      expect(statusOf(snap, "pgpkeys.eu")).toBe("ok");
    })
  );

  it.live("fails only when every server that was asked failed", () =>
    Effect.gen(function* outageGen() {
      stubKeyservers({
        "keyserver.ubuntu.com": text("down", 503),
        "keys.openpgp.org": "hang",
        "pgp.mit.edu": "reset",
        "keys.mailvelope.com": text("down", 502),
        "pgpkeys.eu": text("down", 500),
      });
      const error = yield* run(EMAIL).pipe(Effect.flip);
      expect(error._tag).toBe("HttpVendorError");
    })
  );

  it.live("skips keys.openpgp.org and mailvelope for a name query", () =>
    Effect.gen(function* nameGen() {
      const urls = stubKeyservers({
        "keyserver.ubuntu.com": ubuntu(),
        "pgp.mit.edu": text("", 404),
        "pgpkeys.eu": pgpkeys(),
      });
      const snap = yield* run({ kind: "name", value: "Debian Security" });
      expect(statusOf(snap, "keys.openpgp.org")).toBe("skipped");
      expect(statusOf(snap, "keys.mailvelope.com")).toBe("skipped");
      expect(
        snap.servers.find((s) => s.host === "keys.openpgp.org")?.detail
      ).toBe("unsupported query kind: name");
      expect(urls.map((url) => url.hostname).sort()).toEqual([
        "keyserver.ubuntu.com",
        "pgp.mit.edu",
        "pgpkeys.eu",
      ]);
    })
  );

  it.live("skips them for a domain query and filters keyword matches", () =>
    Effect.gen(function* domainGen() {
      const urls = stubKeyservers({
        "keyserver.ubuntu.com": text(
          fixture("pgp-hkp-domain-keyword-match.txt")
        ),
        "pgp.mit.edu": text("", 404),
        "pgpkeys.eu": text("Not Found", 404),
      });
      const snap = yield* run({ kind: "domain", value: "example.com" });
      expect(statusOf(snap, "keys.openpgp.org")).toBe("skipped");
      expect(urls.some((url) => url.hostname === "keys.openpgp.org")).toBe(
        false
      );
      expect(
        urls.every((url) => url.searchParams.get("search") === "@example.com")
      ).toBe(true);
      // Four keys came back; Bob (subdomain) and Cy (keyword only) are dropped.
      expect(
        snap.servers.find((s) => s.host === "keyserver.ubuntu.com")?.keyCount
      ).toBe(4);
      expect(snap.keys.map((key) => key.fingerprint?.[0])).toEqual(["A", "D"]);
    })
  );

  it.live("sends key ids and fingerprints to every server", () =>
    Effect.gen(function* keyGen() {
      const urls = stubKeyservers({
        "keyserver.ubuntu.com": ubuntu(),
        "keys.openpgp.org": text(fixture("pgp-hkp-hagrid-fingerprint.txt")),
        "pgp.mit.edu": text("", 404),
        "keys.mailvelope.com": text("Key not found", 404),
        "pgpkeys.eu": pgpkeys(),
      });
      const snap = yield* run({ kind: "key_id", value: "6BAF400B05C3E651" });
      expect(urls).toHaveLength(5);
      expect(urls[0]?.searchParams.get("search")).toBe("0x6BAF400B05C3E651");
      expect(snap.keys[0]?.servers).toEqual([
        "keyserver.ubuntu.com",
        "keys.openpgp.org",
        "pgpkeys.eu",
      ]);
    })
  );

  it.live("reports a 200 that is not an HKP index as an error", () =>
    Effect.gen(function* htmlGen() {
      stubKeyservers({
        "keyserver.ubuntu.com": text("<html>maintenance</html>"),
        "keys.openpgp.org": text("", 404),
        "pgp.mit.edu": text("", 404),
        "keys.mailvelope.com": text("", 404),
        "pgpkeys.eu": text("", 404),
      });
      const snap = yield* run(EMAIL);
      expect(statusOf(snap, "keyserver.ubuntu.com")).toBe("error");
      expect(snap.keys).toEqual([]);
    })
  );

  it.live("marks revoked and expired keys in the snapshot", () =>
    Effect.gen(function* flagsGen() {
      stubKeyservers({
        "keyserver.ubuntu.com": text(fixture("pgp-hkp-flags.txt")),
        "keys.openpgp.org": text("", 404),
        "pgp.mit.edu": text("", 404),
        "keys.mailvelope.com": text("", 404),
        "pgpkeys.eu": text("", 404),
      });
      const snap = yield* run({ kind: "name", value: "Mallory" });
      const flags = snap.keys.map((key) => [
        key.fingerprint?.[0] ?? key.keyId,
        key.revoked,
        key.expired,
      ]);
      expect(flags).toEqual([
        ["1", false, true],
        ["2", true, false],
        ["5", false, false],
        ["3333333333333333", false, false],
        ["44444444", false, false],
      ]);
    })
  );
});
