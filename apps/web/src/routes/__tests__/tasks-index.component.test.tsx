import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const useSearchMock = vi.hoisted(() => vi.fn(() => ({ entityId: undefined })));
const useNavigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useSearch: useSearchMock,
      useNavigate: useNavigateMock,
    }),
  };
});

vi.mock("@/domains/tasks/components/tasks-page", () => ({
  TasksPage: ({ entityId }: { entityId?: string }) => (
    <div>Tasks page {entityId ?? "all"}</div>
  ),
}));

import { Route } from "@/routes/_protected/cases/$caseSlug/tasks";

const ACTIVE = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowedEgress: ["local", "target"],
};

describe("tasks index route", () => {
  it("loads tasks for the Case in the URL and prefetches entities", async () => {
    const entityId = testId(50);
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient: client, workCase: ACTIVE },
      deps: { entityId },
    } as never);
    await Promise.resolve();

    expect(query).toHaveBeenCalledTimes(3);
  });

  it("renders the tasks page with the entity filter", () => {
    useSearchMock.mockReturnValue({ entityId: testId(50) } as never);
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText(`Tasks page ${testId(50)}`)).toBeInTheDocument();
  });
});
