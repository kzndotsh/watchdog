import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@watchdog/core/errors";
import type { ZipSink } from "@watchdog/core/export";
import { testApiKey } from "@watchdog/schemas/testing";
import { testId, testHttpOrigin } from "@watchdog/test-kit";

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    actor: { id: "actor-1" },
    credential: { kind: "session" },
    log: { set: vi.fn() },
  })
);
const measureMock = vi.hoisted(() => vi.fn());
const startJobMock = vi.hoisted(() => vi.fn());
const writeZipMock = vi.hoisted(() => vi.fn());
const linkMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

vi.mock("@/auth/api-context.server", () => ({
  createApiContext: createApiContextMock,
}));

vi.mock("@watchdog/api", () => ({
  runApp: (effect: Effect.Effect<unknown, unknown>) =>
    Effect.runPromise(effect),
  actorLabelFromContext: () => undefined,
  actorKeyIdFromContext: () => undefined,
}));

vi.mock("@watchdog/core/export", () => ({
  measureCaseExportEffect: measureMock,
  startCaseExportJobEffect: startJobMock,
  writeCaseExportZipEffect: writeZipMock,
  caseExportLinkEffect: linkMock,
}));

import { Route } from "@/routes/api/v1/cases.$caseId.export[.]zip";
import { Route as DownloadRoute } from "@/routes/api/v1/cases.$caseId.exports.$jobId";

const CASE_ID = testId(10);
const JOB_ID = testId(11);
const handlers = (
  Route.options as {
    server: {
      handlers: Record<
        string,
        (ctx: {
          request: Request;
          params: { caseId: string };
        }) => Promise<Response>
      >;
    };
  }
).server.handlers;

const request = () =>
  new Request(testHttpOrigin("localhost", "/api/v1/cases/x/export.zip"));

function signedIn(log = vi.fn()) {
  createApiContextMock.mockResolvedValueOnce({
    credential: { kind: "session" },
    actor: { userId: "actor-1", organizationId: "org-1" },
    log: { set: log },
  });
}

describe("case export zip route", () => {
  it("returns 401 when unauthenticated", async () => {
    createApiContextMock.mockResolvedValueOnce({
      actor: null,
      log: { set: vi.fn() },
    });

    const response = await handlers.GET({
      request: request(),
      params: { caseId: CASE_ID },
    });

    expect(response.status).toBe(401);
  });

  it("returns 403 insufficient_scope for a key without cases:read, before reading the Case", async () => {
    createApiContextMock.mockResolvedValueOnce({
      credential: testApiKey("key-1", []),
      actor: { userId: "actor-1", organizationId: "org-1" },
      log: { set: vi.fn() },
    });
    measureMock.mockClear();

    const response = await handlers.GET({
      request: request(),
      params: { caseId: CASE_ID },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "FORBIDDEN",
      data: { code: "insufficient_scope", requiredScope: "cases:read" },
    });
    expect(measureMock).not.toHaveBeenCalled();
  });

  it("streams the zip as an attachment while the export writes it", async () => {
    signedIn();
    measureMock.mockReturnValueOnce(
      Effect.succeed({
        kind: "ok",
        caseSlug: "alpha",
        evidenceBytes: 10,
        overLimit: false,
      })
    );
    writeZipMock.mockImplementationOnce((_caseId: string, sink: ZipSink) =>
      Effect.promise(async () => {
        await sink.write(new Uint8Array([1, 2]));
        await sink.write(new Uint8Array([3]));
        await sink.end();
        return { markdownFiles: 1, evidenceIncluded: 0, evidenceSkipped: 0 };
      })
    );

    const response = await handlers.GET({
      request: request(),
      params: { caseId: CASE_ID },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="alpha-\d{12}\.zip"$/
    );
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      1, 2, 3,
    ]);
    expect(startJobMock).not.toHaveBeenCalled();
  });

  it("breaks the body, not the status, when the export fails after it started", async () => {
    signedIn();
    measureMock.mockReturnValueOnce(
      Effect.succeed({
        kind: "ok",
        caseSlug: "alpha",
        evidenceBytes: 10,
        overLimit: false,
      })
    );
    writeZipMock.mockImplementationOnce((_caseId: string, sink: ZipSink) =>
      Effect.promise(async () => {
        await sink.write(new Uint8Array([1]));
        throw new Error("read failed halfway");
      })
    );

    const response = await handlers.GET({
      request: request(),
      params: { caseId: CASE_ID },
    });

    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow();
  });

  it("answers 202 with the Job when the Case is over the inline limit, and does not stream", async () => {
    const log = vi.fn();
    signedIn(log);
    writeZipMock.mockClear();
    measureMock.mockReturnValueOnce(
      Effect.succeed({
        kind: "ok",
        caseSlug: "alpha",
        evidenceBytes: 500,
        overLimit: true,
      })
    );
    startJobMock.mockReturnValueOnce(
      Effect.succeed({ jobId: JOB_ID, status: "queued", created: true })
    );

    const response = await handlers.GET({
      request: request(),
      params: { caseId: CASE_ID },
    });

    const statusUrl = `/api/v1/cases/${CASE_ID}/exports/${JOB_ID}`;
    expect(response.status).toBe(202);
    expect(response.headers.get("Location")).toBe(statusUrl);
    expect(await response.json()).toMatchObject({
      jobId: JOB_ID,
      status: "queued",
      statusUrl,
    });
    expect(startJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: CASE_ID,
        organizationId: "org-1",
        actorId: "actor-1",
      })
    );
    expect(writeZipMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        export: { kind: "job", jobId: JOB_ID, joined: false },
      })
    );
  });

  it("returns 404 when the Case is not in the caller's organization", async () => {
    signedIn();
    measureMock.mockReturnValueOnce(Effect.succeed({ kind: "missing_case" }));

    const response = await handlers.GET({
      request: request(),
      params: { caseId: CASE_ID },
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 for a route param that is not a case id, without a lookup", async () => {
    signedIn();
    measureMock.mockClear();

    const response = await handlers.GET({
      request: request(),
      params: { caseId: "not-a-uuid" },
    });

    expect(response.status).toBe(404);
    expect(measureMock).not.toHaveBeenCalled();
  });
});

const downloadHandlers = (
  DownloadRoute.options as {
    server: {
      handlers: Record<
        string,
        (ctx: {
          request: Request;
          params: { caseId: string; jobId: string };
        }) => Promise<Response>
      >;
    };
  }
).server.handlers;

const get = (params = { caseId: CASE_ID, jobId: JOB_ID }) =>
  downloadHandlers.GET({
    request: new Request(
      testHttpOrigin("localhost", `/api/v1/cases/${CASE_ID}/exports/${JOB_ID}`)
    ),
    params,
  });

describe("case export download route", () => {
  it("returns 401 when unauthenticated", async () => {
    createApiContextMock.mockResolvedValueOnce({ actor: null });
    expect((await get()).status).toBe(401);
  });

  it("returns 403 insufficient_scope for a key without cases:read", async () => {
    createApiContextMock.mockResolvedValueOnce({
      credential: testApiKey("key-1", []),
      actor: { userId: "actor-1", organizationId: "org-1" },
    });
    linkMock.mockClear();
    const response = await get();
    expect(response.status).toBe(403);
    expect(linkMock).not.toHaveBeenCalled();
  });

  it("redirects to the signed URL while the link is live, and never caches the redirect", async () => {
    signedIn();
    linkMock.mockReturnValueOnce(
      Effect.succeed({
        kind: "ready",
        url: "https://files.example.test/signed",
        filename: "alpha.zip",
        expiresAt: "2026-01-02T00:00:00.000Z",
      })
    );
    const response = await get();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://files.example.test/signed"
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 410 once the link has expired", async () => {
    signedIn();
    linkMock.mockReturnValueOnce(
      Effect.succeed({ kind: "expired", expiredAt: "2026-01-02T00:00:00.000Z" })
    );
    const response = await get();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      expiredAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("answers 202 while the Job is queued or running", async () => {
    signedIn();
    linkMock.mockReturnValueOnce(
      Effect.succeed({ kind: "pending", status: "running" })
    );
    const response = await get();
    expect(response.status).toBe(202);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(await response.json()).toEqual({ jobId: JOB_ID, status: "running" });
  });

  it("answers 409 when the Job ended without an archive", async () => {
    signedIn();
    linkMock.mockReturnValueOnce(
      Effect.succeed({ kind: "ended", status: "failed", error: "boom" })
    );
    const response = await get();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      status: "failed",
      error: "boom",
    });
  });

  it("answers 404 for a Job that is not an export of this Case, and for ids that are not ids", async () => {
    signedIn();
    linkMock.mockReturnValueOnce(
      Effect.fail(new NotFoundError({ entity: "Job", id: JOB_ID }))
    );
    expect((await get()).status).toBe(404);

    signedIn();
    linkMock.mockClear();
    expect((await get({ caseId: "x", jobId: JOB_ID })).status).toBe(404);
    signedIn();
    expect((await get({ caseId: CASE_ID, jobId: "y" })).status).toBe(404);
    expect(linkMock).not.toHaveBeenCalled();
  });
});
