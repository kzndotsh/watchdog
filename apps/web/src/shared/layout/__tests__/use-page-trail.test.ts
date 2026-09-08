import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const routerStateMock = vi.hoisted(() =>
  vi.fn(({ select }: { select: (state: unknown) => unknown }) =>
    select({
      location: { pathname: "/tasks" },
      matches: [{ params: {} }],
    })
  )
);

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

import { usePageTrail } from "@/shared/layout/use-page-trail";

describe("usePageTrail", () => {
  it("builds trail items from pathname and case context", () => {
    routerStateMock.mockImplementation(
      ({ select }: { select: (state: unknown) => unknown }) =>
        select({
          location: { pathname: "/tasks" },
          matches: [{ params: {} }],
        })
    );
    useQueryMock.mockImplementation(
      (query: { queryKey?: readonly unknown[]; enabled?: boolean }) => {
        if (query.queryKey?.[0] === "cases") {
          return {
            data: {
              active: {
                id: testId(1),
                slug: "alpha",
                name: "Alpha",
              },
              cases: [{ id: testId(1), slug: "alpha", name: "Alpha" }],
            },
          };
        }
        return {
          data: null,
          isFetched: true,
          isError: false,
          isLoading: false,
        };
      }
    );

    const { result } = renderHook(() => usePageTrail());

    expect(result.current.items.at(-1)?.label).toBe("Tasks");
    expect(result.current.items[0]?.label).toBe("Alpha");
    expect(result.current.pendingLast).toBe(false);
    expect(result.current.errorLast).toBe(false);
  });

  it("marks the dossier crumb pending before entity fetch settles", () => {
    routerStateMock.mockImplementation(
      ({ select }: { select: (state: unknown) => unknown }) =>
        select({
          location: { pathname: "/entities/acme" },
          matches: [{ params: { entitySlug: "acme" } }],
        })
    );
    useQueryMock.mockImplementation(
      (query: { queryKey?: readonly unknown[] }) => {
        if (query.queryKey?.[0] === "cases") {
          return {
            data: {
              active: { id: testId(1), slug: "alpha", name: "Alpha" },
              cases: [{ id: testId(1), slug: "alpha", name: "Alpha" }],
            },
          };
        }
        return {
          data: undefined,
          isFetched: false,
          isError: false,
          isLoading: false,
        };
      }
    );

    const { result } = renderHook(() => usePageTrail());

    expect(result.current.pendingLast).toBe(true);
    expect(result.current.errorLast).toBe(false);
  });

  it("labels the dossier crumb unavailable when entity fetch fails", () => {
    routerStateMock.mockImplementation(
      ({ select }: { select: (state: unknown) => unknown }) =>
        select({
          location: { pathname: "/entities/acme" },
          matches: [{ params: { entitySlug: "acme" } }],
        })
    );
    useQueryMock.mockImplementation(
      (query: { queryKey?: readonly unknown[] }) => {
        if (query.queryKey?.[0] === "cases") {
          return {
            data: {
              active: { id: testId(1), slug: "alpha", name: "Alpha" },
              cases: [{ id: testId(1), slug: "alpha", name: "Alpha" }],
            },
          };
        }
        return {
          data: undefined,
          isFetched: true,
          isError: true,
          isLoading: false,
          isFetching: false,
        };
      }
    );

    const { result } = renderHook(() => usePageTrail());

    expect(result.current.pendingLast).toBe(false);
    expect(result.current.errorLast).toBe(true);
    expect(result.current.items.at(-1)?.label).toBe("Unavailable");
  });

  it("defers dossier unavailable while entity query refetches", () => {
    routerStateMock.mockImplementation(
      ({ select }: { select: (state: unknown) => unknown }) =>
        select({
          location: { pathname: "/entities/acme" },
          matches: [{ params: { entitySlug: "acme" } }],
        })
    );
    useQueryMock.mockImplementation(
      (query: { queryKey?: readonly unknown[] }) => {
        if (query.queryKey?.[0] === "cases") {
          return {
            data: {
              active: { id: testId(1), slug: "alpha", name: "Alpha" },
              cases: [{ id: testId(1), slug: "alpha", name: "Alpha" }],
            },
            isFetched: true,
            isError: false,
            isLoading: false,
            isFetching: false,
          };
        }
        return {
          data: undefined,
          isFetched: true,
          isError: true,
          isLoading: false,
          isFetching: true,
        };
      }
    );

    const { result } = renderHook(() => usePageTrail());

    expect(result.current.errorLast).toBe(false);
    expect(result.current.items.at(-1)?.label).not.toBe("Unavailable");
  });

  it("labels the case crumb unavailable when cases context fetch fails", () => {
    routerStateMock.mockImplementation(
      ({ select }: { select: (state: unknown) => unknown }) =>
        select({
          location: { pathname: "/cases/alpha" },
          matches: [{ params: { caseSlug: "alpha" } }],
        })
    );
    useQueryMock.mockImplementation(
      (query: { queryKey?: readonly unknown[] }) => {
        if (query.queryKey?.[0] === "cases") {
          return {
            data: undefined,
            isFetched: true,
            isError: true,
            isLoading: false,
            isFetching: false,
          };
        }
        return {
          data: null,
          isFetched: true,
          isError: false,
          isLoading: false,
        };
      }
    );

    const { result } = renderHook(() => usePageTrail());

    expect(result.current.errorLast).toBe(true);
    expect(result.current.items.at(-1)?.label).toBe("Unavailable");
  });

  it("labels the dossier crumb unavailable when cases context fetch fails", () => {
    routerStateMock.mockImplementation(
      ({ select }: { select: (state: unknown) => unknown }) =>
        select({
          location: { pathname: "/entities/acme" },
          matches: [{ params: { entitySlug: "acme" } }],
        })
    );
    useQueryMock.mockImplementation(
      (query: { queryKey?: readonly unknown[] }) => {
        if (query.queryKey?.[0] === "cases") {
          return {
            data: undefined,
            isFetched: true,
            isError: true,
            isLoading: false,
            isFetching: false,
          };
        }
        return {
          data: undefined,
          isFetched: false,
          isError: false,
          isLoading: false,
        };
      }
    );

    const { result } = renderHook(() => usePageTrail());

    expect(result.current.errorLast).toBe(true);
    expect(result.current.items.at(-1)?.label).toBe("Unavailable");
  });

  it("does not enable entity fetch when the active case id is not a graph uuid", () => {
    routerStateMock.mockImplementation(
      ({ select }: { select: (state: unknown) => unknown }) =>
        select({
          location: { pathname: "/entities/acme" },
          matches: [{ params: { entitySlug: "acme" } }],
        })
    );
    useQueryMock.mockImplementation(
      (query: { queryKey?: readonly unknown[]; enabled?: boolean }) => {
        if (query.queryKey?.[0] === "cases") {
          return {
            data: {
              active: { id: "case-1", slug: "alpha", name: "Alpha" },
              cases: [{ id: "case-1", slug: "alpha", name: "Alpha" }],
            },
          };
        }
        return {
          data: undefined,
          enabled: query.enabled,
          isFetched: false,
          isError: false,
          isLoading: false,
        };
      }
    );

    renderHook(() => usePageTrail());

    const entityCall = useQueryMock.mock.calls.find(
      (call) => call[0]?.queryKey?.[0] === "entity"
    );
    expect(entityCall?.[0]).toMatchObject({ enabled: false });
  });
});
