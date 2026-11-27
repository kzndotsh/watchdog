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
    await claim(acme.id, "Incorporated in 2021", "possible");
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

  it("counts the Case's Claims per tier and those citing no Evidence", async () => {
    const { counts } = await seedClaims();

    expect(await counts({})).toEqual({
      counts: [
        { confidence: "possible", count: 2 },
        { confidence: "unverified", count: 2 },
      ],
      uncited: 3,
      isCapped: false,
    });
  });

  it("applies the list's filters and q", async () => {
    const { ada, counts } = await seedClaims();

    expect(await counts({ entityId: ada.id, q: "ada" })).toEqual({
      counts: [
        { confidence: "possible", count: 1 },
        { confidence: "unverified", count: 1 },
      ],
      uncited: 1,
      isCapped: false,
    });
  });

  it("lists only the Claims citing no Evidence under the uncited filter", async () => {
    const { list } = await seedClaims();

    const page = await list({ uncited: true });

    expect(page.items.map((row) => row.text)).toEqual([
      "Uses the handle ada88",
      "Runs a mail server",
      "Incorporated in 2021",
    ]);
  });
});
