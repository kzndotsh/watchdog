import { createHmac, randomBytes } from "node:crypto";

import { Layer } from "effect";
import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  pinEvidenceId,
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
} from "@watchdog/test-db";

import { recordingBlobStore } from "../../infra/blob-store";
import { makeCredentialFingerprint } from "../../infra/credential-fingerprint";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { writeCaseExportZipEffect } from "../case-export";
import { NO_OPT_INS, type CaseExportOptions } from "../provider-body-policy";
import type { CaseExportSettings } from "../settings";
import type { ZipSink } from "../zip-writer";

/*
 * Breach Evidence in a Case Export: credential fields are cut to attributes unless an owner or
 * admin opted in; a breach file that cannot be checked is withheld and the README says so.
 */

const store = recordingBlobStore();
const run = runDomainWith(Layer.mergeAll(Db.layer, store.layer));

const SETTINGS: CaseExportSettings = {
  inlineMaxBytes: 100 * 1024 * 1024,
  linkTtlMs: 60_000,
  concurrency: 3,
};

const PASSWORD = "hunter2";
const BCRYPT = `$2b$10$${"a".repeat(53)}`;
const SHA1 = "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8";
const SNUS_PASSWORD = "correct-horse-battery";
const MD5 = "5f4dcc3b5aa765d61d8327deb882cf99";

const OPTED_IN: CaseExportOptions = {
  ...NO_OPT_INS,
  shouldIncludeBreachCredentials: true,
};

const base = {
  queriedAt: "2026-01-01T00:00:00.000Z",
  found: true,
  total: 2,
  sampleCount: 2,
  reuse: [],
};

const fullDehashed = {
  ...base,
  query: "alice@example.com",
  kind: "email",
  source: "api.dehashed.com",
  balance: 5,
  databases: ["ExampleDump"],
  credentialMode: "full",
  entries: [
    {
      databaseName: "ExampleDump",
      email: "alice@example.com",
      username: null,
      ipAddress: null,
      name: null,
      phone: null,
      password: PASSWORD,
      hashedPassword: BCRYPT,
    },
    {
      databaseName: "OtherDump",
      email: "alice@example.com",
      username: null,
      ipAddress: null,
      name: null,
      phone: null,
      password: PASSWORD,
      hashedPassword: SHA1,
    },
  ],
};

const fullSnusbase = {
  ...base,
  query: "alice@example.com",
  kind: "email",
  source: "api.snusbase.com",
  tables: [{ name: "ExampleTable", count: 1 }],
  credentialMode: "full",
  entries: [
    {
      table: "ExampleTable",
      email: "alice@example.com",
      username: null,
      password: SNUS_PASSWORD,
      hash: MD5,
      lastip: null,
      name: null,
      host: null,
      domain: null,
    },
  ],
};

let caseId: CaseId;
let slug: string;

/** A file in the Case's storage, written by a Job of `capabilityId`, and the Evidence row for it. */
async function seedArtifact(opts: {
  capabilityId: string;
  name: string;
  bytes: Uint8Array;
  /** Fixes the Evidence id, so a test can place the row before or after another in export order. */
  evidenceId?: string;
}) {
  const uri = `${caseId}/${opts.name}`;
  store.objects.set(uri, opts.bytes);
  await seedJob(db, caseId, {
    status: "succeeded",
    capabilityId: opts.capabilityId,
    output: [{ name: opts.name, mime: "application/json", uri, sha256: "00" }],
  });
  const row = await seedEvidence(db, caseId, {
    kind: "file",
    label: opts.name,
    mime: "application/json",
    uri,
    text: null,
  });
  return opts.evidenceId === undefined
    ? row
    : pinEvidenceId(db, row, opts.evidenceId);
}

const json = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

async function exportCase(
  options: CaseExportOptions,
  /** Runs once, when the archive's first bytes are written: the export is under way. */
  onFirstWrite?: () => Promise<void>
) {
  const chunks: Uint8Array[] = [];
  let isFirst = true;
  const sink: ZipSink = {
    write: async (chunk) => {
      if (isFirst) {
        isFirst = false;
        await onFirstWrite?.();
      }
      chunks.push(chunk);
    },
    end: () => Promise.resolve(),
  };
  const stats = await run(
    writeCaseExportZipEffect(caseId, sink, SETTINGS, options)
  );
  const files = unzipSync(Buffer.concat(chunks));
  const texts = Object.entries(files).map(
    ([name, bytes]) => [name, strFromU8(bytes)] as const
  );
  const find = (part: string) =>
    texts.find(([name]) => name.includes(part))?.[1];
  return { stats, texts, find, everything: texts.map(([, t]) => t).join("\n") };
}

beforeEach(async () => {
  await resetTestDb();
  store.objects.clear();
  const cased = await seedCase(db, { name: "Breach export" });
  caseId = cased.id;
  slug = cased.slug;
});

describe("breach Evidence in an Export", () => {
  it("cuts DeHashed and Snusbase credentials to attributes by default: no password and no hash anywhere in the archive", async () => {
    await seedArtifact({
      capabilityId: "breach.dehashed.lookup",
      name: "dehashed-alice.json",
      bytes: json(fullDehashed),
    });
    await seedArtifact({
      capabilityId: "breach.snusbase.lookup",
      name: "snusbase-alice.json",
      bytes: json(fullSnusbase),
    });

    const out = await exportCase(NO_OPT_INS);

    for (const secret of [PASSWORD, BCRYPT, SHA1, SNUS_PASSWORD, MD5]) {
      expect(out.everything).not.toContain(secret);
    }
    expect(out.stats.breachEvidenceRedacted).toBe(2);
    expect(out.stats.breachEvidenceWithheld).toBe(0);
    const dehashed = JSON.parse(out.find("dehashed-alice") ?? "{}");
    expect(dehashed.credentialMode).toBe("safe");
    expect(dehashed.entries[0]).toMatchObject({
      email: "alice@example.com",
      databaseName: "ExampleDump",
      password: { present: true, kind: "plaintext", length: 7 },
      hashedPassword: { present: true, kind: "bcrypt", length: BCRYPT.length },
    });
    // The fingerprint is the instance's: equal passwords match, and it is not the value.
    expect(dehashed.entries[0].password.fingerprint).toBe(
      dehashed.entries[1].password.fingerprint
    );
    expect(out.find("VERIFY.md")).toContain("## Breach credentials");
    expect(out.find("VERIFY.md")).toContain("2 breach Evidence file(s)");
  });

  it("keeps the stored credentials when an owner or admin opted in", async () => {
    await seedArtifact({
      capabilityId: "breach.dehashed.lookup",
      name: "dehashed-alice.json",
      bytes: json(fullDehashed),
    });

    const out = await exportCase(OPTED_IN);

    const file = out.find("dehashed-alice") ?? "";
    expect(file).toContain(PASSWORD);
    expect(file).toContain(BCRYPT);
    expect(out.stats.breachEvidenceRedacted).toBe(0);
    expect(out.find("VERIFY.md")).toContain("included breach credentials");
  });

  it("writes a safe-mode artifact as it is: there is nothing to cut", async () => {
    const fp = (value: string, role: string) =>
      createHmac("sha256", "any").update(`${role}\0${value}`).digest("hex");
    const safe = {
      ...fullDehashed,
      credentialMode: "safe",
      entries: fullDehashed.entries.map((entry) => ({
        ...entry,
        password: {
          present: true,
          kind: "plaintext",
          length: 7,
          fingerprint: fp(entry.password, "plaintext"),
        },
        hashedPassword: { present: false },
      })),
    };
    await seedArtifact({
      capabilityId: "breach.dehashed.lookup",
      name: "dehashed-alice.json",
      bytes: json(safe),
    });

    const out = await exportCase(NO_OPT_INS);

    expect(JSON.parse(out.find("dehashed-alice") ?? "{}")).toEqual(safe);
    expect(out.stats.breachEvidenceWithheld).toBe(0);
  });

  it("withholds a breach file it cannot parse, and the README says why; the content is never written", async () => {
    await seedArtifact({
      capabilityId: "breach.dehashed.lookup",
      name: "dehashed-odd.json",
      bytes: json({ entries: [{ password: PASSWORD }], note: BCRYPT }),
    });
    await seedArtifact({
      capabilityId: "breach.snusbase.lookup",
      name: "snusbase-garbled.json",
      bytes: new TextEncoder().encode(`not json ${SNUS_PASSWORD}`),
    });

    const out = await exportCase(NO_OPT_INS);

    expect(out.texts.some(([name]) => name.includes("dehashed-odd"))).toBe(
      false
    );
    expect(out.texts.some(([name]) => name.includes("snusbase-garbled"))).toBe(
      false
    );
    for (const secret of [PASSWORD, BCRYPT, SNUS_PASSWORD]) {
      expect(out.everything).not.toContain(secret);
    }
    expect(out.stats.breachEvidenceWithheld).toBe(2);
    const readme = out.find("VERIFY.md") ?? "";
    expect(readme).toContain(
      "These breach Evidence files are not in the archive"
    );
    expect(readme).toContain("dehashed-odd.json");
    expect(readme).toContain("(`unreadable`)");
  });

  it("withholds a breach file past the read limit instead of writing it as it is", async () => {
    await seedArtifact({
      capabilityId: "breach.dehashed.lookup",
      name: "dehashed-huge.json",
      bytes: new Uint8Array(8 * 1024 * 1024 + 1).fill(120),
    });

    const out = await exportCase(NO_OPT_INS);

    expect(out.texts.some(([name]) => name.includes("dehashed-huge"))).toBe(
      false
    );
    expect(out.find("VERIFY.md")).toContain("(`too_large`)");
  });

  it("leaves Evidence that no breach Cap wrote alone, whatever it contains", async () => {
    await seedArtifact({
      capabilityId: "network.dns.lookup",
      name: "notes.json",
      bytes: json({ password: PASSWORD }),
    });
    await seedEvidence(db, caseId, { text: `hash ${SHA1}` });

    const out = await exportCase(NO_OPT_INS);

    expect(out.find("notes")).toContain(PASSWORD);
    expect(out.find("--")).toBeDefined();
    expect(out.stats.breachEvidenceRedacted).toBe(0);
    expect(out.find("VERIFY.md")).not.toContain("## Breach credentials");
    expect(slug.length).toBeGreaterThan(0);
  });

  it("redacts a breach Job's Evidence that committed after the export started", async () => {
    // The first row is exported first; the breach Job lands (Job output and Evidence in one go)
    // once the archive has begun, with an id that sorts after it, so the export reaches it later.
    const first = await seedEvidence(db, caseId, {
      kind: "file",
      // Large and incompressible, so the archive emits bytes while this row is written.
      text: randomBytes(300_000).toString("hex"),
    });

    await pinEvidenceId(db, first, "00000000-0000-4000-8000-000000000001");

    const out = await exportCase(NO_OPT_INS, async () => {
      await seedArtifact({
        capabilityId: "breach.dehashed.lookup",
        name: "dehashed-late.json",
        bytes: json(fullDehashed),
        evidenceId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      });
    });

    const late = out.find("dehashed-late");
    expect(late).toBeDefined();
    expect(out.everything).not.toContain(PASSWORD);
    expect(out.everything).not.toContain(BCRYPT);
    expect(JSON.parse(late ?? "{}").credentialMode).toBe("safe");
  });

  it("redacts breach-shaped JSON that no Job on record produced, and leaves other JSON alone", async () => {
    store.objects.set(`${caseId}/orphan.json`, json(fullSnusbase));
    await seedEvidence(db, caseId, {
      kind: "file",
      label: "orphan.json",
      mime: "application/json",
      uri: `${caseId}/orphan.json`,
      text: null,
    });
    store.objects.set(`${caseId}/other.json`, json({ password: PASSWORD }));
    await seedEvidence(db, caseId, {
      kind: "file",
      label: "other.json",
      mime: "application/json",
      uri: `${caseId}/other.json`,
      text: null,
    });

    const out = await exportCase(NO_OPT_INS);

    expect(out.find("orphan")).not.toContain(SNUS_PASSWORD);
    expect(JSON.parse(out.find("orphan") ?? "{}").credentialMode).toBe("safe");
    expect(out.find("other")).toContain(PASSWORD);
  });

  it("fingerprints with the instance key: another key gives other fingerprints", async () => {
    await seedArtifact({
      capabilityId: "breach.snusbase.lookup",
      name: "snusbase-alice.json",
      bytes: json(fullSnusbase),
    });
    const out = await exportCase(NO_OPT_INS);
    const exported = JSON.parse(out.find("snusbase-alice") ?? "{}");
    const mine = makeCredentialFingerprint("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")(
      SNUS_PASSWORD,
      "plaintext"
    );
    const other = makeCredentialFingerprint("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")(
      SNUS_PASSWORD,
      "plaintext"
    );
    // The integration env's master key is the first one.
    expect(exported.entries[0].password.fingerprint).toBe(mine);
    expect(exported.entries[0].password.fingerprint).not.toBe(other);
  });
});
