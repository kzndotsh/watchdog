import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { listEvidenceForCaseEffect } = vi.hoisted(() => ({
  listEvidenceForCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listEvidenceForCaseEffect,
    dumpPasteEffect: vi.fn(),
    dumpUrlEffect: vi.fn(),
    softDeleteEvidenceEffect: vi.fn(),
    restoreEvidenceEffect: vi.fn(),
    attachEvidenceEntityEffect: vi.fn(),
    presignUploadEffect: vi.fn(),
    confirmFileUploadEffect: vi.fn(),
    getEvidenceDownloadUrlEffect: vi.fn(),
    processEvidenceEffect: vi.fn(),
    enrichUrlEvidenceEffect: vi.fn(),
  };
});

import { list } from "../evidence";

const actor = { userId: "u1", email: "a@test.local", name: "Agent" };

describe("evidence procedures", () => {
  it("lists evidence for a case", async () => {
    listEvidenceForCaseEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000040",
          caseId: "00000000-0000-4000-8000-000000000001",
          entityId: null,
          kind: "file",
          label: "notes.txt",
          notes: null,
          mime: "text/plain",
          uri: null,
          sha256: null,
          text: null,
          sourceUrl: null,
          actorId: "u1",
          capturedAt: "2026-01-01T00:00:00.000Z",
          processedAt: null,
          deletedAt: null,
        },
      ])
    );

    const client = createRouterClient(
      { list },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.list({ caseId: "00000000-0000-4000-8000-000000000001" })
    ).resolves.toHaveLength(1);
  });
});
