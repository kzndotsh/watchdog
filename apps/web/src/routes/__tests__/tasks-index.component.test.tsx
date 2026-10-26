import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseTasksSearch } from "@/domains/tasks/lib/tasks-search";
import { tasksKeys } from "@/domains/tasks/queries";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const useSearchMock = vi.hoisted(() => vi.fn((): unknown => ({})));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({ useSearch: useSearchMock }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/domains/tasks/components/tasks-page", () => ({
  TasksPage: ({ search }: { search: { entityId?: string } }) => (
    <div>Tasks page {search.entityId ?? "all"}</div>
  ),
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/tasks";

const ACTIVE = {
  id: testCaseId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

type Loader = (ctx: {
  context: { queryClient: QueryClient; workCase: typeof ACTIVE };
  location: { search: Record<string, unknown> };
}) => unknown;

function isLoader(value: unknown): value is Loader {
  return typeof value === "function";
}

describe("tasks route", () => {
  it("drops a hand-typed status and a bad task id from the URL", () => {
    const entityId = testId(50);
    expect(
      parseTasksSearch({ entityId, status: ["done"], taskId: "nope", q: "dns" })
    ).toEqual({ entityId, q: "dns" });
  });

  it("warms the URL's board and the first page of Done and Dropped, never an Entity list", async () => {
    const entityId = testId(50);
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);
    const firstPages = vi
      .spyOn(client, "infiniteQuery")
      .mockResolvedValue({ pages: [], pageParams: [] });
    vi.stubGlobal("window", window);
    const loader = Route.options.loader;
    if (!isLoader(loader)) throw new Error("loader");

    loader({
      context: { queryClient: client, workCase: ACTIVE },
      location: { search: { entityId } },
    });
    await Promise.resolve();

    expect(query.mock.calls.map(([options]) => options.queryKey)).toEqual([
      tasksKeys.board(ACTIVE.id, { entityId }),
    ]);
    expect(firstPages).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("renders the board with the URL's view", () => {
    useSearchMock.mockReturnValue({ entityId: testId(50) });
    const Page = Route.options.component;
    if (Page === undefined) throw new Error("component");
    render(<Page />);
    expect(screen.getByText(`Tasks page ${testId(50)}`)).toBeInTheDocument();
  });
});
