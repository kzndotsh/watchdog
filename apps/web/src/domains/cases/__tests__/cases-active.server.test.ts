import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start/server-only", () => ({}));

const resolveActiveCaseEffect = vi.hoisted(() => vi.fn());
vi.mock("@watchdog/core/cases", () => ({ resolveActiveCaseEffect }));
vi.mock("@watchdog/api", () => ({
  runApp: (effect: Effect.Effect<unknown>) => Effect.runPromise(effect),
}));

import { resolveActiveCase } from "@/domains/cases/cases-active.server";
import { asCaseId, asOrganizationId } from "@watchdog/schemas/shared";

const ORG = asOrganizationId("org_test");
const STORED = asCaseId("550e8400-e29b-41d4-a716-446655440000");

function sessionContext(organizationId: typeof ORG | null) {
  return { organizationId, session: {} } as never;
}

describe("resolveActiveCase", () => {
  it("runs core's rule scoped to the session's organization", async () => {
    const resolved = { cases: [], active: null };
    resolveActiveCaseEffect.mockReturnValue(Effect.succeed(resolved));

    await expect(resolveActiveCase(sessionContext(ORG), STORED)).resolves.toBe(
      resolved
    );
    expect(resolveActiveCaseEffect).toHaveBeenCalledWith(ORG, STORED);
  });

  it("refuses a session with no organization before reading any Case", async () => {
    resolveActiveCaseEffect.mockClear();

    await expect(
      resolveActiveCase(sessionContext(null), STORED)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(resolveActiveCaseEffect).not.toHaveBeenCalled();
  });
});
