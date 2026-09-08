import { createRouterClient } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const {
  listEvidenceForCaseEffect,
  dumpPasteEffect,
  dumpUrlEffect,
  presignUploadEffect,
  attachEvidenceEntityEffect,
} = vi.hoisted(() => ({
  listEvidenceForCaseEffect: vi.fn(),
  dumpPasteEffect: vi.fn(),
  dumpUrlEffect: vi.fn(),
  presignUploadEffect: vi.fn(),
  attachEvidenceEntityEffect: vi.fn(),
}));

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    listEvidenceForCaseEffect,
    dumpPasteEffect,
    dumpUrlEffect,
    softDeleteEvidenceEffect: vi.fn(),
    restoreEvidenceEffect: vi.fn(),
    attachEvidenceEntityEffect,
    presignUploadEffect,
    confirmFileUploadEffect: vi.fn(),
    getEvidenceDownloadUrlEffect: vi.fn(),
    processEvidenceEffect: vi.fn(),
    enrichUrlEvidenceEffect: vi.fn(),
  };
});

import {
  list,
  createPaste,
  createUrl,
  confirmFile,
  presign,
  attachEntity,
} from "../evidence";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

const CASE_ID = "00000000-0000-4000-8000-000000000001";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000040";

describe("evidence procedures", () => {
  it("lists evidence for a case", async () => {
    listEvidenceForCaseEffect.mockReturnValueOnce(
      Effect.succeed([
        {
          id: "00000000-0000-4000-8000-000000000040",
          caseId: CASE_ID,
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
          actorLabel: "u1",
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

    await expect(client.list({ caseId: CASE_ID })).resolves.toHaveLength(1);
  });

  it("rejects hiddenOnly with active-queue filters", async () => {
    listEvidenceForCaseEffect.mockClear();
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
      client.list({
        caseId: CASE_ID,
        hiddenOnly: true,
        unprocessedOnly: true,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
    expect(listEvidenceForCaseEffect).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only paste bodies", async () => {
    const client = createRouterClient(
      { createPaste },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.createPaste({
        caseId: CASE_ID,
        body: "   ",
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("accepts padded optional entityId on createPaste", async () => {
    const entityId = "00000000-0000-4000-8000-000000000050";
    dumpPasteEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000040",
        caseId: CASE_ID,
        entityId,
        kind: "file",
        label: null,
        notes: null,
        mime: "text/plain",
        uri: "x",
        sha256: null,
        text: null,
        sourceUrl: null,
        actorId: "u1",
        actorLabel: "u1",
        capturedAt: "2026-01-01T00:00:00.000Z",
        processedAt: null,
        deletedAt: null,
      })
    );
    const client = createRouterClient(
      { createPaste },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await client.createPaste({
      caseId: CASE_ID,
      body: "hello",
      entityId: `  ${entityId}  `,
    });

    expect(dumpPasteEffect).toHaveBeenCalledWith(
      expect.objectContaining({ entityId })
    );
  });

  it("clears blank sourceUrl on createPaste and trims padded URLs", async () => {
    dumpPasteEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000040",
        caseId: CASE_ID,
        entityId: null,
        kind: "file",
        label: null,
        notes: null,
        mime: "text/plain",
        uri: "x",
        sha256: null,
        text: null,
        sourceUrl: null,
        actorId: "u1",
        actorLabel: "u1",
        capturedAt: "2026-01-01T00:00:00.000Z",
        processedAt: null,
        deletedAt: null,
      })
    );
    const client = createRouterClient(
      { createPaste },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await client.createPaste({
      caseId: CASE_ID,
      body: "hello",
      sourceUrl: "   ",
    });
    const blankUrlCall = dumpPasteEffect.mock.calls.at(-1)?.[0] as {
      sourceUrl?: string;
    };
    expect(blankUrlCall?.sourceUrl).toBeUndefined();

    dumpPasteEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000041",
        caseId: CASE_ID,
        entityId: null,
        kind: "file",
        label: null,
        notes: null,
        mime: "text/plain",
        uri: "x",
        sha256: null,
        text: null,
        sourceUrl: "https://example.com/note",
        actorId: "u1",
        actorLabel: "u1",
        capturedAt: "2026-01-01T00:00:00.000Z",
        processedAt: null,
        deletedAt: null,
      })
    );

    await client.createPaste({
      caseId: CASE_ID,
      body: "hello",
      sourceUrl: "  https://example.com/note  ",
    });
    expect(dumpPasteEffect).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceUrl: "https://example.com/note" })
    );
  });

  it("accepts padded sourceUrl on createUrl", async () => {
    dumpUrlEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000040",
        caseId: CASE_ID,
        entityId: null,
        kind: "url_archive",
        label: null,
        notes: null,
        mime: null,
        uri: null,
        sha256: null,
        text: "https://example.com/page",
        sourceUrl: "https://example.com/page",
        actorId: "u1",
        actorLabel: "u1",
        capturedAt: "2026-01-01T00:00:00.000Z",
        processedAt: null,
        deletedAt: null,
      })
    );
    const client = createRouterClient(
      { createUrl },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await client.createUrl({
      caseId: CASE_ID,
      sourceUrl: "  https://example.com/page  ",
    });

    expect(dumpUrlEffect).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: "https://example.com/page" })
    );
  });

  it("rejects non-http evidence URLs", async () => {
    const client = createRouterClient(
      { createUrl },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    // oxlint-disable-next-line eslint/no-script-url -- intentional non-http URL for validation test
    const scriptUrl = "javascript:alert(1)";
    await expect(
      client.createUrl({
        caseId: CASE_ID,
        sourceUrl: scriptUrl,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("defaults blank mime on presign to application/octet-stream", async () => {
    const sha256 = "a".repeat(64);
    presignUploadEffect.mockReturnValueOnce(
      Effect.succeed({
        url: "https://upload.example/presign",
        uri: `${CASE_ID}/${sha256}`,
        sha256,
        mime: "application/octet-stream",
        byteLength: 1,
        expiresIn: 900,
        headers: {},
      })
    );
    const client = createRouterClient(
      { presign },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await client.presign({
      caseId: CASE_ID,
      sha256,
      mime: "   ",
      byteLength: 1,
    });

    expect(presignUploadEffect).toHaveBeenCalledWith(
      expect.objectContaining({ mime: "application/octet-stream" })
    );
  });

  it("accepts padded sha256 on presign", async () => {
    const sha256 = "a".repeat(64);
    presignUploadEffect.mockReturnValueOnce(
      Effect.succeed({
        url: "https://upload.example/presign",
        uri: `${CASE_ID}/${sha256}`,
        sha256,
        mime: "application/octet-stream",
        byteLength: 1,
        expiresIn: 900,
        headers: {},
      })
    );
    const client = createRouterClient(
      { presign },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await client.presign({
      caseId: CASE_ID,
      sha256: `  ${sha256.toUpperCase()}  `,
      mime: "application/octet-stream",
      byteLength: 1,
    });

    expect(presignUploadEffect).toHaveBeenCalledWith(
      expect.objectContaining({ sha256 })
    );
  });

  it("rejects confirmFile URIs outside the case prefix", async () => {
    const client = createRouterClient(
      { confirmFile },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.confirmFile({
        caseId: CASE_ID,
        uri: "other-case/evidence/file.bin",
        mime: "application/octet-stream",
        sha256: "a".repeat(64),
        byteLength: 1,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("rejects confirmFile URIs that do not match the declared sha256", async () => {
    const sha256 = "a".repeat(64);
    const client = createRouterClient(
      { confirmFile },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.confirmFile({
        caseId: CASE_ID,
        uri: `${CASE_ID}/${"b".repeat(64)}/file.bin`,
        mime: "application/octet-stream",
        sha256,
        byteLength: 1,
      })
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  it("clears entity attachment when entityId is whitespace-only", async () => {
    attachEvidenceEntityEffect.mockReturnValueOnce(
      Effect.succeed({
        id: EVIDENCE_ID,
        caseId: CASE_ID,
        entityId: null,
        kind: "file",
        label: null,
        notes: null,
        mime: "text/plain",
        uri: null,
        sha256: null,
        text: null,
        sourceUrl: null,
        actorId: "u1",
        actorLabel: "u1",
        capturedAt: "2026-01-01T00:00:00.000Z",
        processedAt: null,
        deletedAt: null,
      })
    );
    const client = createRouterClient(
      { attachEntity },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await client.attachEntity({
      caseId: CASE_ID,
      evidenceId: EVIDENCE_ID,
      entityId: "   ",
    });

    expect(attachEvidenceEntityEffect).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: null })
    );
  });
});
