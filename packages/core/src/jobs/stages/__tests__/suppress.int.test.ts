import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { db } from "@watchdog/db";
import { buildClaimCreateOp } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedProposal,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { createJobLog } from "../../job-log";
import { suppressStageEffect } from "../suppress";

describe("suppressStageEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns an empty result for an empty patch", async () => {
    const cased = await seedCase(db);
    const jobLog = createJobLog();
    const result = await runDomain(suppressStageEffect(cased.id, [], jobLog));
    expect(result).toEqual({ kept: [], suppressed: 0 });
    expect(jobLog.lines).toEqual([]);
  });

  it("keeps new findings and logs nothing when none is known", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const fresh = buildClaimCreateOp(entity.id, "Fresh finding", {
      id: testId(60),
    });
    const jobLog = createJobLog();

    const result = await runDomain(
      suppressStageEffect(cased.id, [fresh], jobLog)
    );

    expect(result.kept).toEqual([fresh]);
    expect(result.suppressed).toBe(0);
    expect(jobLog.lines).toEqual([]);
  });

  it("drops a finding already in a pending Proposal and logs the count", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const known = buildClaimCreateOp(entity.id, "Already proposed", {
      id: testId(61),
    });
    const fresh = buildClaimCreateOp(entity.id, "Fresh finding", {
      id: testId(62),
    });
    await seedProposal(db, cased.id, [known]);
    const jobLog = createJobLog();

    const result = await runDomain(
      suppressStageEffect(cased.id, [known, fresh], jobLog)
    );

    expect(result.suppressed).toBe(1);
    expect(result.kept).toEqual([fresh]);
    expect(jobLog.lines.some((line) => line.includes("suppressed 1"))).toBe(
      true
    );
  });
});
