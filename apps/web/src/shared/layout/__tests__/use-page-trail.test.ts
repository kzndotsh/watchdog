import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const useQueryMock = vi.hoisted(() => vi.fn());
const routerStateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useRouterState: routerStateMock,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { RouteCaseContext } from "@/shared/hooks/use-route-case";
import { usePageTrail } from "@/shared/layout/use-page-trail";
import { buildCaseRecord } from "@/testing/records";

const ALPHA = buildCaseRecord();

function at(pathname: string, params: Record<string, string>) {
  routerStateMock.mockImplementation(
    ({ select }: { select: (state: unknown) => unknown }) =>
      select({ location: { pathname }, matches: [{ params }] })
  );
}

function entityQuery(result: Record<string, unknown>) {
  useQueryMock.mockImplementation((query: { enabled?: boolean }) => ({
    enabled: query.enabled,
    ...result,
  }));
}

function render(routeCase: typeof ALPHA | null = ALPHA) {
  return renderHook(() => usePageTrail(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(RouteCaseContext, { value: routeCase }, children),
  });
}

describe("usePageTrail", () => {
  it("builds the trail from the Case in the URL", () => {
    at("/cases/alpha/tasks", { caseSlug: "alpha" });
    entityQuery({ data: null, isFetched: true });

    const { result } = render();

    expect(result.current.items.map((item) => item.label)).toEqual([
      "Alpha",
      "Tasks",
    ]);
    expect(result.current.isPendingLast).toBe(false);
    expect(result.current.isErrorLast).toBe(false);
  });

  it("falls back to the slug text before the Case route resolved", () => {
    at("/cases/alpha/tasks", { caseSlug: "alpha" });
    entityQuery({ data: null, isFetched: true });

    const { result } = render(null);

    expect(result.current.items[0]?.label).toBe("alpha");
  });

  it("marks the dossier crumb pending before entity fetch settles", () => {
    at("/cases/alpha/entities/acme", {
      caseSlug: "alpha",
      entitySlug: "acme",
    });
    entityQuery({ data: undefined, isFetched: false });

    const { result } = render();

    expect(result.current.isPendingLast).toBe(true);
    expect(result.current.isErrorLast).toBe(false);
  });

  it("labels the dossier crumb unavailable when entity fetch fails", () => {
    at("/cases/alpha/entities/acme", {
      caseSlug: "alpha",
      entitySlug: "acme",
    });
    entityQuery({
      data: undefined,
      isFetched: true,
      isError: true,
      isFetching: false,
    });

    const { result } = render();

    expect(result.current.isPendingLast).toBe(false);
    expect(result.current.isErrorLast).toBe(true);
    expect(result.current.items.at(-1)?.label).toBe("Unavailable");
  });

  it("defers dossier unavailable while entity query refetches", () => {
    at("/cases/alpha/entities/acme", {
      caseSlug: "alpha",
      entitySlug: "acme",
    });
    entityQuery({
      data: undefined,
      isFetched: true,
      isError: true,
      isFetching: true,
    });

    const { result } = render();

    expect(result.current.isErrorLast).toBe(false);
    expect(result.current.items.at(-1)?.label).not.toBe("Unavailable");
  });

  it("looks the entity up in the URL's Case, not the cookie's", () => {
    at("/cases/alpha/entities/acme", {
      caseSlug: "alpha",
      entitySlug: "acme",
    });
    entityQuery({ data: undefined, isFetched: false });

    render();

    const entityCall = useQueryMock.mock.calls.find(
      (call) => call[0]?.queryKey?.[0] === "entities"
    );
    expect(entityCall?.[0]?.queryKey).toContain(ALPHA.id);
  });
});
