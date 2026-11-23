import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createEntityEffect } = vi.hoisted(() => ({
  createEntityEffect: vi.fn(),
}));

vi.mock("#core/graph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#core/graph")>();
  return { ...actual, createEntityEffect };
});

import { testActor, testApiKey } from "@watchdog/domain/schemas/testing";

import { create } from "../entities";

const CASE_ID = "00000000-0000-4000-8000-000000000001";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000003";

const entityRow = {
  id: "00000000-0000-4000-8000-000000000010",
  caseId: CASE_ID,
  kind: "infra" as const,
  name: "mirror.acme.test",
  slug: "mirror-acme-test",
  summary: null,
  notes: null,
  createdAt: "1970-01-01T00:00:00.000Z",
  updatedAt: "1970-01-01T00:00:00.000Z",
  createdBy: null,
  updatedBy: null,
  version: 1,
};

function keyClient() {
  return createRouterClient(
    { create },
    {
      context: {
        headers: new Headers(),
        actor: testActor(),
        credential: testApiKey(),
      },
    }
  );
}

const identifier = (confidence: "unverified" | "confirmed") => ({
  type: "domain" as const,
  value: "mirror.acme.test",
  confidence,
  status: "unknown" as const,
  evidenceIds: [EVIDENCE_ID],
});

describe("entities.create from an API key", () => {
  beforeEach(() => {
    createEntityEffect.mockReset();
    createEntityEffect.mockReturnValue(Effect.succeed(entityRow));
  });

  it("refuses a confirmed Identifier, even with userOverride", async () => {
    await expect(
      keyClient().create({
        caseId: CASE_ID,
        kind: "infra",
        name: "mirror.acme.test",
        identifier: identifier("confirmed"),
        userOverride: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createEntityEffect).not.toHaveBeenCalled();
  });

  it("needs userOverride for an Identifier", async () => {
    await expect(
      keyClient().create({
        caseId: CASE_ID,
        kind: "infra",
        name: "mirror.acme.test",
        identifier: identifier("unverified"),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createEntityEffect).not.toHaveBeenCalled();
  });

  it("writes an unverified Identifier with userOverride, which core never sees", async () => {
    await keyClient().create({
      caseId: CASE_ID,
      kind: "infra",
      name: "mirror.acme.test",
      identifier: identifier("unverified"),
      userOverride: true,
    });
    expect(createEntityEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: expect.objectContaining({ confidence: "unverified" }),
      })
    );
    expect(createEntityEffect).toHaveBeenCalledWith(
      expect.not.objectContaining({ userOverride: expect.anything() })
    );
  });

  it("creates a bare Entity without userOverride, as before", async () => {
    await expect(
      keyClient().create({ caseId: CASE_ID, kind: "infra", name: "Bare" })
    ).resolves.toMatchObject({ id: entityRow.id });
  });
});
