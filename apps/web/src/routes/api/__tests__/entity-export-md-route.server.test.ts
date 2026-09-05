import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@watchdog/core";
import { testId, testHttpOrigin } from "@watchdog/test-kit";

const createApiContextMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    actor: { userId: "actor-1", organizationId: "org-1" },
  })
);
const getCaseByIdEffectMock = vi.hoisted(() => vi.fn());
const getEntityByCaseSlugEffectMock = vi.hoisted(() => vi.fn());
const renderEntityMarkdownEffectMock = vi.hoisted(() => vi.fn());

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

vi.mock("@watchdog/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core")>();
  return {
    ...actual,
    getCaseByIdEffect: getCaseByIdEffectMock,
    getEntityByCaseSlugEffect: getEntityByCaseSlugEffectMock,
    renderEntityMarkdownEffect: renderEntityMarkdownEffectMock,
  };
});

import { Route } from "@/routes/api/v1/cases.$caseId.entities.$slug.export[.]md";

const CASE_ID = testId(10);
const handlers = (
  Route.options as {
    server: {
      handlers: Record<
        string,
        (ctx: {
          request: Request;
          params: { caseId: string; slug: string };
        }) => Promise<Response>
      >;
    };
  }
).server.handlers;

describe("entity export markdown route", () => {
  it("returns 401 when unauthenticated", async () => {
    createApiContextMock.mockResolvedValueOnce({ actor: null });

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", "/api/v1/cases/x/entities/y/export.md")
      ),
      params: { caseId: CASE_ID, slug: "target" },
    });

    expect(response.status).toBe(401);
  });

  it("returns markdown when the entity export succeeds", async () => {
    createApiContextMock.mockResolvedValueOnce({
      actor: { userId: "actor-1", organizationId: "org-1" },
    });
    getCaseByIdEffectMock.mockReturnValueOnce(
      Effect.succeed({ id: CASE_ID, slug: "alpha" })
    );
    getEntityByCaseSlugEffectMock.mockReturnValueOnce(
      Effect.succeed({ id: testId(20) })
    );
    renderEntityMarkdownEffectMock.mockReturnValueOnce(
      Effect.succeed({ markdown: "# Target\n" })
    );

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin("localhost", "/api/v1/cases/x/entities/target/export.md")
      ),
      params: { caseId: CASE_ID, slug: "target" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(await response.text()).toBe("# Target\n");
  });

  it("returns 404 when the entity is missing", async () => {
    createApiContextMock.mockResolvedValueOnce({
      actor: { userId: "actor-1", organizationId: "org-1" },
    });
    getCaseByIdEffectMock.mockReturnValueOnce(
      Effect.succeed({ id: CASE_ID, slug: "alpha" })
    );
    getEntityByCaseSlugEffectMock.mockReturnValueOnce(
      new NotFoundError({ resource: "Entity not found" })
    );

    const response = await handlers.GET({
      request: new Request(
        testHttpOrigin(
          "localhost",
          "/api/v1/cases/x/entities/missing/export.md"
        )
      ),
      params: { caseId: CASE_ID, slug: "missing" },
    });

    expect(response.status).toBe(404);
  });
});
