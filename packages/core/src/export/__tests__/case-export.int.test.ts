import { randomBytes, randomUUID } from "node:crypto";

import { unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@watchdog/db";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-db";

import { warmObjectStore } from "../../infra/__tests__/helpers/object-store-ready";
import { runDomain } from "../../infra/run-domain";
import {
  measureCaseExportEffect,
  writeCaseExportZipEffect,
} from "../case-export";
import type { ZipSink } from "../zip-writer";
import { MIB, SETTINGS, upload } from "./helpers/case-export-fixtures";

/** A sink that keeps everything, for tests that open the archive. */
function collectingSink(): ZipSink & { archive: () => Uint8Array } {
  const chunks: Uint8Array[] = [];
  return {
    write: (chunk) => {
      chunks.push(chunk);
      return Promise.resolve();
    },
    end: () => Promise.resolve(),
    archive: () => Buffer.concat(chunks),
  };
}

warmObjectStore();

describe("Case export (streaming)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("writes the archive of a Case: notes, Evidence files and text, and counts what it left out", async () => {
    const cased = await seedCase(db, { name: "Streamed" });
    const entity = await seedEntity(db, cased.id, {
      id: randomUUID(),
      name: "Alice Example",
    });
    const payload = randomBytes(300_000);
    const stored = await upload(cased.id, payload, "scan.bin");
    await seedEvidence(db, cased.id, {
      kind: "file",
      label: "scan.bin",
      mime: "application/octet-stream",
      uri: stored.uri,
      sha256: stored.sha256,
      text: null,
      entityId: entity.id,
    });
    await seedEvidence(db, cased.id, {
      kind: "file",
      label: "gone.bin",
      uri: `${cased.id}/missing/gone.bin`,
      sha256: "0".repeat(64),
      text: null,
    });
    await seedEvidence(db, cased.id, {
      kind: "other",
      label: "pasted",
      text: "pasted text body",
    });
    await seedEvidence(db, cased.id, {
      kind: "attestation",
      label: "statement",
      text: "I saw it",
    });

    const sink = collectingSink();
    const stats = await runDomain(
      writeCaseExportZipEffect(cased.id, sink, SETTINGS)
    );

    const files = unzipSync(sink.archive());
    const names = Object.keys(files);
    expect(names).toContain(`${cased.slug}/CASE.md`);
    expect(names).toContain(`${cased.slug}/${entity.kind}s/${entity.slug}.md`);
    expect(names).toContain(`${cased.slug}/evidence/attestations.md`);
    const scan = names.find((name) => name.includes("--scan"));
    expect(scan).toBeDefined();
    expect(Buffer.from(files[scan ?? ""] ?? []).equals(payload)).toBe(true);
    const pasted = names.find((name) => name.endsWith(".txt"));
    expect(new TextDecoder().decode(files[pasted ?? ""])).toBe(
      "pasted text body"
    );
    expect(stats).toMatchObject({
      evidenceIncluded: 2,
      evidenceSkipped: 1,
    });
    expect(stats.evidenceBytes).toBe(
      payload.byteLength + "pasted text body".length
    );
  });

  it("measures a Case without reading it, and stops counting once it is over the limit", async () => {
    const cased = await seedCase(db, { name: "Measured" });
    const stored = await upload(cased.id, randomBytes(2 * MIB), "big.bin");
    for (let i = 0; i < 6; i += 1) {
      // One object behind several rows: sizes are counted per row, as the export reads them.
      // oxlint-disable-next-line no-await-in-loop -- seeds are sequential
      await seedEvidence(db, cased.id, {
        kind: "file",
        label: `copy-${i}.bin`,
        uri: stored.uri,
        sha256: stored.sha256,
        text: null,
      });
    }
    const under = await runDomain(
      measureCaseExportEffect(cased.id, cased.organizationId, {
        ...SETTINGS,
        inlineMaxBytes: 100 * MIB,
      })
    );
    expect(under).toMatchObject({
      kind: "ok",
      evidenceBytes: 12 * MIB,
      overLimit: false,
    });
    const over = await runDomain(
      measureCaseExportEffect(cased.id, cased.organizationId, {
        ...SETTINGS,
        inlineMaxBytes: 5 * MIB,
        concurrency: 2,
      })
    );
    // Batches of two rows (4 MiB each): the third batch is never counted.
    expect(over).toMatchObject({ kind: "ok", overLimit: true });
    expect(over.kind === "ok" && over.evidenceBytes).toBe(8 * MIB);
  });
});
