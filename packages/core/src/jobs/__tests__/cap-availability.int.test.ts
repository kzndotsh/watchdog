import { beforeEach, describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { putCredentialEffect, runDomain } from "@watchdog/core";
import { casesRepo, db } from "@watchdog/db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { resetTestDb, seedCase } from "@watchdog/test-kit/db";

import { evaluateCapAvailabilityEffect } from "../cap-availability.ts";

describe("evaluateCapAvailability", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("blocks extract.ai without vault credentials even when egress is on", async () => {
    const cased = await seedCase(db);
    await casesRepo.update(db, cased.id, { allowThirdPartyEgress: true });
    const cap = requireCapability("evidence.extract.ai");
    const { result } = await runDomain(
      evaluateCapAvailabilityEffect({
        actorId: TEST_ACTOR_ID,
        caseId: cased.id,
        cap,
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("missing_credential");
  });

  it("allows extract.ai when a compatible key is stored", async () => {
    const cased = await seedCase(db);
    await casesRepo.update(db, cased.id, { allowThirdPartyEgress: true });
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "AI_COMPAT_API_KEY",
        secret: "sk-test",
      })
    );
    const cap = requireCapability("evidence.extract.ai");
    const { result } = await runDomain(
      evaluateCapAvailabilityEffect({
        actorId: TEST_ACTOR_ID,
        caseId: cased.id,
        cap,
      })
    );
    expect(result.ok).toBe(true);
  });
});
