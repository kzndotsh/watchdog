import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "#core/infra";
import { putCredentialEffect } from "#core/vault";
import { resetTestDb, seedCase, testDb as db } from "#test-db";
import { requireCapability } from "@watchdog/caps";
import { EGRESS_CLASSES } from "@watchdog/domain/schemas/shared";
import { TEST_ACTOR_ID } from "@watchdog/domain/test-kit";

import { evaluateCapAvailabilityEffect } from "../cap-availability.ts";

describe("evaluateCapAvailability", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("blocks extract.ai without vault credentials even when egress is on", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
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
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
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
