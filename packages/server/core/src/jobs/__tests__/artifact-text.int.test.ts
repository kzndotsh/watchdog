import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "#db";
import { resetTestDb, seedCase, seedEvidence, seedJob } from "#test-db";
import type { CaseId } from "@watchdog/domain/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/domain/schemas/testing";

import { readEvidenceTextEffect } from "../../evidence/evidence-text";
import { ARTIFACT_TEXT_MAX_CHARS } from "../../infra/artifact-text";
import { recordingBlobStore } from "../../infra/blob-store";
import { Db } from "../../infra/db-service";
import { runDomainWith } from "../../infra/run-domain";
import { readJobArtifactTextEffect } from "../artifact-text";

/*
 * The preview text behind `jobs.artifactText` and `evidence.text`: a Job artifact is read by its
 * hash only when its own mime is text and its object sits under the Case; an Evidence body is read
 * by its stored uri. Both read in the caller's organization and cut long bodies.
 */

const store = recordingBlobStore();
const run = runDomainWith(Layer.mergeAll(Db.layer, store.layer));

const TEXT_SHA = "a".repeat(64);
const BINARY_SHA = "b".repeat(64);
const STRAY_SHA = "c".repeat(64);
const CLIMB_SHA = "e".repeat(64);

let caseId: CaseId;
let jobId: string;

const bytes = (text: string) => new TextEncoder().encode(text);

beforeEach(async () => {
  await resetTestDb();
  store.objects.clear();
  caseId = (await seedCase(db, { name: "Artifacts" })).id;
  const job = await seedJob(db, caseId, {
    status: "succeeded",
    output: [
      {
        name: "report.yaml",
        mime: "application/yaml",
        uri: `${caseId}/report.yaml`,
        sha256: TEXT_SHA,
      },
      {
        name: "shot.png",
        mime: "image/png",
        uri: `${caseId}/shot.png`,
        sha256: BINARY_SHA,
      },
      {
        name: "stray.txt",
        mime: "text/plain",
        uri: "another-case/stray.txt",
        sha256: STRAY_SHA,
      },
      {
        name: "climb.txt",
        mime: "text/plain",
        uri: `${caseId}/../another-case/stray.txt`,
        sha256: CLIMB_SHA,
      },
    ],
  });
  jobId = job.id;
  store.objects.set(`${caseId}/report.yaml`, bytes("key: value"));
  store.objects.set(`${caseId}/shot.png`, bytes("png"));
  store.objects.set("another-case/stray.txt", bytes("not yours"));
});

describe("readJobArtifactTextEffect", () => {
  it("reads a text artifact by its hash", async () => {
    await expect(
      run(
        readJobArtifactTextEffect(caseId, TEST_ORGANIZATION_ID, jobId, TEXT_SHA)
      )
    ).resolves.toEqual({ text: "key: value" });
  });

  it("answers null for a binary artifact, one outside the Case (or climbing out of it) and an unknown hash, without reading them", async () => {
    store.calls.length = 0;
    const answers = await Promise.all(
      [BINARY_SHA, STRAY_SHA, CLIMB_SHA, "d".repeat(64)].map(async (sha) =>
        run(readJobArtifactTextEffect(caseId, TEST_ORGANIZATION_ID, jobId, sha))
      )
    );
    expect(answers).toEqual([
      { text: null },
      { text: null },
      { text: null },
      { text: null },
    ]);
    expect(store.calls).toEqual([]);
  });

  it("cuts a long artifact and marks the cut", async () => {
    store.objects.set(
      `${caseId}/report.yaml`,
      bytes("x".repeat(ARTIFACT_TEXT_MAX_CHARS + 10))
    );
    const { text } = await run(
      readJobArtifactTextEffect(caseId, TEST_ORGANIZATION_ID, jobId, TEXT_SHA)
    );
    expect(text).toBe(`${"x".repeat(ARTIFACT_TEXT_MAX_CHARS)}\n…(truncated)`);
  });

  it("is not found for another organization", async () => {
    await expect(
      run(
        readJobArtifactTextEffect(
          caseId,
          TEST_OTHER_ORGANIZATION_ID,
          jobId,
          TEXT_SHA
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFoundError" });
  });
});

describe("readEvidenceTextEffect", () => {
  it("reads the stored body by its uri, and answers null without one", async () => {
    const stored = await seedEvidence(db, caseId, {
      text: null,
      uri: `${caseId}/note.md`,
      mime: "text/markdown",
    });
    store.objects.set(`${caseId}/note.md`, bytes("# Note"));
    const inline = await seedEvidence(db, caseId, { text: "inline only" });

    await expect(
      run(readEvidenceTextEffect(caseId, TEST_ORGANIZATION_ID, stored.id))
    ).resolves.toEqual({ text: "# Note" });
    await expect(
      run(readEvidenceTextEffect(caseId, TEST_ORGANIZATION_ID, inline.id))
    ).resolves.toEqual({ text: null });
  });

  it("answers null for a stored uri outside the Case, without reading it", async () => {
    const stray = await seedEvidence(db, caseId, {
      text: null,
      uri: "another-case/stray.txt",
      mime: "text/plain",
    });
    store.calls.length = 0;
    await expect(
      run(readEvidenceTextEffect(caseId, TEST_ORGANIZATION_ID, stray.id))
    ).resolves.toEqual({ text: null });
    expect(store.calls).toEqual([]);
  });

  it("is not found for another organization", async () => {
    const stored = await seedEvidence(db, caseId, {
      uri: `${caseId}/note.md`,
    });
    await expect(
      run(readEvidenceTextEffect(caseId, TEST_OTHER_ORGANIZATION_ID, stored.id))
    ).rejects.toMatchObject({ _tag: "NotFoundError" });
  });
});
