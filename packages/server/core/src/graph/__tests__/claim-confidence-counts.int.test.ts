import { beforeEach, describe, expect, it } from "vitest";

import {
  countClaimsByConfidenceEffect,
  createClaimEffect,
  listClaimsEffect,
} from "#core/graph";
import { runDomain } from "#core/infra";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
  testDb as db,
} from "#test-db";
import { claimList } from "@watchdog/domain/schemas/graph";
import type { ConfidenceTier } from "@watchdog/domain/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

describe("countClaimsByConfidence", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function seedClaims() {
    const cased = await seedCase(db);
    const ada = await seedEntity(db, cased.id, { id: testId(20) });
    const acme = await seedEntity(db, cased.id, {
      id: testId(21),
      name: "Acme",
      slug: "acme",
    });
    const evidence = await seedEvidence(db, cased.id, { label: "Whois" });
    const claim = async (
      entityId: string,
      text: string,
      confidence: ConfidenceTier,
      evidenceIds?: string[]
    ) =>
      runDomain(
        createClaimEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          entityId,
          text,
          confidence,
          class: "observation",
          evidenceIds,
        })
      );
    await claim(ada.id, "Registered ada.example", "possible", [evidence.id]);
    await claim(ada.id, "Uses the handle ada88", "unverified");
    await claim(ada.id, "Runs a mail server", "unverified");
    await claim(acme.id, "Incorporated by ada in 2021", "possible");
    const input = (extra: Record<string, unknown>) =>
      claimList.input.parse({ caseId: cased.id, ...extra });
    const counts = async (extra: Record<string, unknown>) =>
      runDomain(
        countClaimsByConfidenceEffect(
          cased.id,
          TEST_ORGANIZATION_ID,
          input(extra)
        )
      );
    const list = async (extra: Record<string, unknown>) =>
      runDomain(listClaimsEffect(cased.id, TEST_ORGANIZATION_ID, input(extra)));
    return { ada, counts, list };
  }

  it("counts the Case's Claims in all, per tier and those citing no Evidence", async () => {
    const { counts } = await seedClaims();

    expect(await counts({})).toEqual({
      all: 4,
      confirmed: 0,
      possible: 2,
      unverified: 2,
      uncited: 3,
    });
  });

  it("applies the Entity filter and q, each on its own", async () => {
    const { ada, counts } = await seedClaims();

    expect(await counts({ entityId: ada.id })).toEqual({
      all: 3,
      confirmed: 0,
      possible: 1,
      unverified: 2,
      uncited: 2,
    });
    expect(await counts({ q: "ada" })).toEqual({
      all: 3,
      confirmed: 0,
      possible: 2,
      unverified: 1,
      uncited: 2,
    });
    expect(await counts({ entityId: ada.id, q: "ada" })).toEqual({
      all: 2,
      confirmed: 0,
      possible: 1,
      unverified: 1,
      uncited: 1,
    });
  });

  it("ignores the tier and uncited filters, which each card applies itself", async () => {
    const { counts } = await seedClaims();

    expect(await counts({ confidence: ["possible"], uncited: true })).toEqual(
      await counts({})
    );
  });

  it("lists only the Claims citing no Evidence under the uncited filter", async () => {
    const { list } = await seedClaims();

    const page = await list({ uncited: true });

    expect(page.items.map((row) => row.text)).toEqual([
      "Uses the handle ada88",
      "Runs a mail server",
      "Incorporated by ada in 2021",
    ]);
  });
});
