import { randomUUID } from "node:crypto";

import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import { evidenceRepo } from "@watchdog/db";
import { evidenceList } from "@watchdog/schemas/evidence";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  captureStatements,
  expectNoSeqScanOn,
  expectQueries,
  resetTestDb,
  seedCase,
  seedAuthUser,
  seedEvidence,
  testDb,
} from "@watchdog/test-db";

import {
  getEvidenceByIdsEffect,
  listEvidenceEffect,
  listEvidencePickerEffect,
} from "../evidence-list";

/**
 * The worked example for the query-count and plan assertions in the testing standards: the
 * Case-scoped Evidence list is a hot path (Collect and Triage open it on every Case switch).
 */
describe("listEvidenceEffect: query budget and plan", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  /** Session-authored Evidence: a UUID actor id with an `auth.user` row, so the actor-name lookup runs. */
  async function seedCaseWithEvidence(rows: number) {
    const actorId = randomUUID();
    await seedAuthUser(testDb, {
      id: actorId,
      name: "Budget Actor",
      email: `${actorId}@example.invalid`,
    });
    const theCase = await seedCase(testDb, {
      name: "Budget",
      slug: "budget",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await Promise.all(
      Array.from({ length: rows }, () =>
        seedEvidence(testDb, theCase.id, { actorId })
      )
    );
    return theCase.id;
  }

  const list = (caseId: Parameters<typeof listEvidenceEffect>[0]) =>
    runDomainWith(Db.layer)(
      listEvidenceEffect(
        caseId,
        TEST_ORGANIZATION_ID,
        evidenceList.input.parse({ caseId })
      ).pipe(Effect.map((page) => page.items))
    );

  it("runs a fixed number of statements however many rows it returns", async () => {
    const caseId = await seedCaseWithEvidence(5);
    // The Case guard, one Evidence read and one actor-name lookup: nothing per row.
    const rows = await expectQueries(3, () => list(caseId));
    expect(rows).toHaveLength(5);
    expect(rows[0]?.actorLabel).toBe("budget-actor");
  });

  it("reads Evidence and the Case guard through indexes", async () => {
    const caseId = await seedCaseWithEvidence(1);
    const { statements } = await captureStatements(() => list(caseId));
    await expectNoSeqScanOn(statements, "evidence");
    await expectNoSeqScanOn(statements, "cases");
  });
});

/**
 * The picker's page (#566) is the same list through a slimmer select: the same rows in the same
 * order for any `q`, filter and sort, but only the title parts, and two statements.
 */
describe("listEvidencePickerEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("answers the list's rows in the list's order with the picker's fields only", async () => {
    const theCase = await seedCase(testDb, {
      name: "Picker",
      slug: "picker",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await seedEvidence(testDb, theCase.id, {
      label: "Memo one",
      text: "body one ".repeat(200),
    });
    await seedEvidence(testDb, theCase.id, {
      label: "Memo two",
      text: "body two ".repeat(200),
    });
    await seedEvidence(testDb, theCase.id, { label: "Other" });
    const run = (query: Record<string, unknown>) => {
      const input = evidenceList.input.parse({ caseId: theCase.id, ...query });
      return runDomainWith(Db.layer)(
        Effect.all({
          full: listEvidenceEffect(theCase.id, TEST_ORGANIZATION_ID, input),
          slim: listEvidencePickerEffect(
            theCase.id,
            TEST_ORGANIZATION_ID,
            input
          ),
        })
      );
    };

    for (const query of [{}, { q: "memo" }, { sort: "label.asc", limit: 2 }]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one view at a time
      const { full, slim } = await run(query);
      expect(slim.items.map((item) => item.id)).toEqual(
        full.items.map((item) => item.id)
      );
      expect(slim.nextCursor).toEqual(full.nextCursor);
      expect(slim.total).toEqual(full.total);
    }
    const { slim } = await run({ q: "memo" });
    expect(slim.items).toHaveLength(2);
    expect(Object.keys(slim.items[0] ?? {}).sort()).toEqual([
      "capturedAt",
      "id",
      "kind",
      "label",
      "sha256",
      "sourceUrl",
    ]);
  });

  it("reads the Case guard and one page, through indexes", async () => {
    const theCase = await seedCase(testDb, {
      name: "Picker plan",
      slug: "picker-plan",
      organizationId: TEST_ORGANIZATION_ID,
    });
    await seedEvidence(testDb, theCase.id, {});
    const { statements } = await captureStatements(() =>
      runDomainWith(Db.layer)(
        listEvidencePickerEffect(
          theCase.id,
          TEST_ORGANIZATION_ID,
          evidenceList.input.parse({ caseId: theCase.id })
        )
      )
    );
    expect(statements).toHaveLength(2);
    await expectNoSeqScanOn(statements, "evidence");
  });
});

/** `evidence.getMany` answers the picker's projection (#573): title parts, never the body. */
describe("getEvidenceByIdsEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("answers the picker's fields for hidden and visible rows, and leaves out a foreign id", async () => {
    const theCase = await seedCase(testDb, {
      name: "By ids",
      slug: "by-ids",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const other = await seedCase(testDb, {
      name: "Other",
      slug: "other-by-ids",
      organizationId: TEST_ORGANIZATION_ID,
    });
    const shown = await seedEvidence(testDb, theCase.id, {
      label: "Memo",
      text: "body ".repeat(200),
    });
    const hidden = await seedEvidence(testDb, theCase.id, { label: "Gone" });
    await evidenceRepo.softDelete(testDb, theCase.id, hidden.id);
    const foreign = await seedEvidence(testDb, other.id, { label: "Foreign" });
    const rows = await runDomainWith(Db.layer)(
      getEvidenceByIdsEffect(theCase.id, TEST_ORGANIZATION_ID, [
        shown.id,
        hidden.id,
        foreign.id,
      ])
    );
    expect(rows.map((row) => row.id).sort()).toEqual(
      [shown.id, hidden.id].sort()
    );
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "capturedAt",
      "id",
      "kind",
      "label",
      "sha256",
      "sourceUrl",
    ]);
  });
});
