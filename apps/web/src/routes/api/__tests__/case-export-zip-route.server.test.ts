import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testId, testHttpOrigin } from "@watchdog/test-kit";

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ actor: { id: "actor-1" }, log: { set: vi.fn() } })
);
const getCaseByIdEffectMock = vi.hoisted(() => vi.fn());
const renderCaseExportEffectMock = vi.hoisted(() => vi.fn());
const zipSyncMock = vi.hoisted(() => vi.fn(() => new Uint8Array([1, 2, 3])));

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
  runApp: (effect: Effect.Effect<unknown>) => Effect.runPromise(effect),
}));

vi.mock("@watchdog/core", () => ({
  getCaseByIdEffect: getCaseByIdEffectMock,
  readArtifactBytesEffect: vi.fn(),
  renderCaseExportEffect: renderCaseExportEffectMock,
  toDomainError: (error: unknown) => error,
}));

vi.mock("fflate", () => ({
  zipSync: zipSyncMock,
  strToU8: (value: string) => new TextEncoder().encode(value),
}));

import { Route } from "@/routes/api/v1/cases.$caseId.export[.]zip";

const CASE_ID = testId(10);
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

describe("case export zip route", () => {
  it("returns 401 when unauthenticated", async () => {
    createApiContextMock.mockResolvedValueOnce({
      actor: null,
      log: { set: vi.fn() },
    });

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", "/api/v1/cases/x/export.zip")
      ),
      params: { caseId: CASE_ID },
    });

    expect(response.status).toBe(401);
  });

  it("returns a zip attachment when export files exist", async () => {
    createApiContextMock.mockResolvedValueOnce({
      actor: { id: "actor-1" },
      log: { set: vi.fn() },
    });
    getCaseByIdEffectMock.mockReturnValueOnce(
      Effect.succeed({ id: CASE_ID, slug: "alpha" })
    );
    renderCaseExportEffectMock.mockReturnValueOnce(
      Effect.succeed({
        files: new Map([["entities/target.md", "# Target"]]),
        evidenceRows: [],
      })
    );

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", "/api/v1/cases/x/export.zip")
      ),
      params: { caseId: CASE_ID },
    });

    expect(zipSyncMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
  });

  it("returns 404 when there are no markdown files to export", async () => {
    createApiContextMock.mockResolvedValueOnce({
      actor: { id: "actor-1" },
      log: { set: vi.fn() },
    });
    getCaseByIdEffectMock.mockReturnValueOnce(
      Effect.succeed({ id: CASE_ID, slug: "alpha" })
    );
    renderCaseExportEffectMock.mockReturnValueOnce(
      Effect.succeed({
        files: new Map(),
        evidenceRows: [],
      })
    );

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", "/api/v1/cases/x/export.zip")
      ),
      params: { caseId: CASE_ID },
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("No entities to export");
  });
});
