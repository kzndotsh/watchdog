import { describe, expect, it } from "vitest";

import { buildClaimCreateOp } from "@watchdog/schemas/testing";
import { seedCase, seedProposal, withTestTx } from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { findingSuppressionsRepo } from "../finding-suppressions.repo.ts";

describe("findingSuppressionsRepo", () => {
  it("inserts fingerprints and lists the ones that match", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const { id: proposalId } = await seedProposal(tx, cased.id, [
        buildClaimCreateOp(testId(20), "x", { id: testId(30) }),
      ]);
      await findingSuppressionsRepo.insertMany(tx, [
        {
          caseId: cased.id,
          fingerprint: "claim|a|hello",
          reason: "rejected",
          proposalId,
        },
      ]);
      const found = await findingSuppressionsRepo.listFingerprints(
        tx,
        cased.id,
        ["claim|a|hello", "claim|b|other"]
      );
      expect(found).toEqual(["claim|a|hello"]);
    });
  });
});
