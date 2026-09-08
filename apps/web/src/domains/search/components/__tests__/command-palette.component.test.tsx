import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { SearchUiContext } from "@/domains/search/hooks/use-search-ui";
import type { AppAction } from "@/shared/lib/app-action";
import { testId } from "@watchdog/test-kit";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const navigateMock = vi.hoisted(() => vi.fn());
const switchCaseMutateMock = vi.hoisted(() => vi.fn());
const useCasesContextMock = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/hooks/use-cases-context", () => ({
  useCasesContext: () => useCasesContextMock(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/shared/lib/use-select-active-case", () => ({
  useSelectActiveCase: () => ({ mutate: switchCaseMutateMock }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { CommandPalette } from "@/domains/search/components/command-palette";

const ACTIVE: CaseRecord = {
  id: testId(10),
  slug: "alpha",
  name: "Alpha",
  description: null,
  allowThirdPartyEgress: false,
};

const EMPTY_APP_ACTIONS: readonly AppAction[] = [];

function SearchUiStub({
  children,
  paletteCommands = EMPTY_APP_ACTIONS,
}: {
  children: ReactNode;
  paletteCommands?: readonly AppAction[];
}) {
  const value = useMemo(
    () => ({
      openPalette: vi.fn(),
      togglePalette: vi.fn(),
      openShortcuts: vi.fn(),
      chromeActions: EMPTY_APP_ACTIONS,
      paletteCommands,
    }),
    [paletteCommands]
  );

  return (
    <SearchUiContext.Provider value={value}>
      {children}
    </SearchUiContext.Provider>
  );
}

function renderPalette(
  open = true,
  queryResult: {
    data?: unknown;
    isFetching?: boolean;
    isError?: boolean;
    error?: unknown;
    refetch?: () => void;
  } = {
    data: undefined,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
  casesCtx: { active: CaseRecord | null; cases: CaseRecord[] } = {
    active: ACTIVE,
    cases: [ACTIVE],
  },
  casesOptions?: { loadError?: string | null; retry?: () => void }
) {
  useCasesContextMock.mockReturnValue({
    casesCtx,
    cases: casesCtx.cases,
    active: casesCtx.active,
    pending: false,
    loadError: casesOptions?.loadError ?? null,
    retry: casesOptions?.retry ?? vi.fn(),
    placeholder: false,
  });
  useQueryMock.mockReturnValue(queryResult);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <SearchUiStub>
        <CommandPalette open={open} onOpenChange={vi.fn()} />
      </SearchUiStub>
    </QueryClientProvider>
  );
}

describe("CommandPalette", () => {
  it("shows jump navigation when the query is shorter than the search minimum", () => {
    renderPalette();
    expect(screen.getByText("Jump to")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search entities, evidence, tasks…")
    ).toBeInTheDocument();
  });

  it("prompts for an active case when search query is ready but none is selected", async () => {
    renderPalette(
      true,
      { data: undefined, isFetching: false, isError: false },
      { active: null, cases: [ACTIVE] }
    );
    const input = screen.getByPlaceholderText(
      "Search entities, evidence, tasks…"
    );
    fireEvent.change(input, { target: { value: "target" } });
    await waitFor(() => {
      expect(
        screen.getByText("Select an active case to search.")
      ).toBeInTheDocument();
    });
  });

  it("shows Commands from SearchChrome paletteCommands when idle", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useCasesContextMock.mockReturnValue({
      casesCtx: { active: ACTIVE, cases: [ACTIVE] },
      cases: [ACTIVE],
      active: ACTIVE,
      pending: false,
      loadError: null,
      retry: vi.fn(),
      placeholder: false,
    });
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: false,
    });

    render(
      <QueryClientProvider client={client}>
        <SearchUiStub
          paletteCommands={[
            {
              id: "toggle-sidebar",
              label: "Toggle sidebar",
              group: "app",
              run: vi.fn(),
            },
            {
              id: "shortcuts",
              label: "Shortcuts",
              group: "app",
              run: vi.fn(),
            },
          ]}
        >
          <CommandPalette open onOpenChange={vi.fn()} />
        </SearchUiStub>
      </QueryClientProvider>
    );

    expect(screen.getByText("Commands")).toBeInTheDocument();
    expect(screen.getByText("Toggle sidebar")).toBeInTheDocument();
    expect(screen.getByText("Shortcuts")).toBeInTheDocument();
    expect(screen.queryByText("Search…")).not.toBeInTheDocument();
  });

  it("shows entity hits after debounced search input", async () => {
    renderPalette(true, {
      data: {
        entities: [
          {
            id: testId(20),
            name: "Target One",
            slug: "target-one",
            kind: "person",
          },
        ],
        identifiers: [],
        evidence: [],
        tasks: [],
        jobs: [],
        proposals: [],
        cases: [],
        evidenceLabels: {},
        entityLabels: {},
      },
      isFetching: false,
      isError: false,
    });

    fireEvent.change(
      screen.getByPlaceholderText("Search entities, evidence, tasks…"),
      { target: { value: "ta" } }
    );

    await waitFor(() => {
      expect(screen.queryByText("Jump to")).not.toBeInTheDocument();
      expect(screen.getByText("Entities")).toBeInTheDocument();
      expect(screen.getByText("Target One")).toBeInTheDocument();
      expect(screen.getByText("Person")).toBeInTheDocument();
    });
  });

  it("shows slug fallback for entity hits with blank names", async () => {
    renderPalette(true, {
      data: {
        entities: [
          {
            id: testId(22),
            name: "",
            slug: "acme-corp",
            kind: "org",
          },
        ],
        identifiers: [],
        evidence: [],
        tasks: [],
        jobs: [],
        proposals: [],
        cases: [],
        evidenceLabels: {},
        entityLabels: {},
      },
      isFetching: false,
      isError: false,
    });

    fireEvent.change(
      screen.getByPlaceholderText("Search entities, evidence, tasks…"),
      { target: { value: "ac" } }
    );

    await waitFor(() => {
      expect(screen.getByText("acme-corp")).toBeInTheDocument();
      expect(screen.getByText("Org")).toBeInTheDocument();
    });
  });

  it("shows task status when a task has no entity", async () => {
    renderPalette(true, {
      data: {
        entities: [],
        identifiers: [],
        evidence: [],
        tasks: [
          {
            id: testId(21),
            title: "Follow up",
            status: "in_progress",
            priority: null,
            entityId: null,
            entityName: null,
          },
        ],
        jobs: [],
        proposals: [],
        cases: [],
        evidenceLabels: {},
        entityLabels: {},
      },
      isFetching: false,
      isError: false,
    });

    fireEvent.change(
      screen.getByPlaceholderText("Search entities, evidence, tasks…"),
      { target: { value: "fo" } }
    );

    await waitFor(() => {
      expect(screen.getByText("Tasks")).toBeInTheDocument();
      expect(screen.getByText("Follow up")).toBeInTheDocument();
      expect(screen.getByText("In Progress")).toBeInTheDocument();
    });
  });

  it("shows task priority with status when no entity is attached", async () => {
    renderPalette(true, {
      data: {
        entities: [],
        identifiers: [],
        evidence: [],
        tasks: [
          {
            id: testId(22),
            title: "Escalate",
            status: "in_progress",
            priority: "high",
            entityId: null,
            entityName: null,
          },
        ],
        jobs: [],
        proposals: [],
        cases: [],
        evidenceLabels: {},
        entityLabels: {},
      },
      isFetching: false,
      isError: false,
    });

    fireEvent.change(
      screen.getByPlaceholderText("Search entities, evidence, tasks…"),
      { target: { value: "es" } }
    );

    await waitFor(() => {
      expect(screen.getByText("In Progress · High")).toBeInTheDocument();
    });
  });

  it("navigates to tasks with taskId when a task hit is selected", async () => {
    const entityId = testId(30);
    const taskId = testId(21);
    renderPalette(true, {
      data: {
        entities: [],
        identifiers: [],
        evidence: [],
        tasks: [
          {
            id: taskId,
            title: "Follow up",
            status: "in_progress",
            priority: null,
            entityId,
            entityName: "Ada",
          },
        ],
        jobs: [],
        proposals: [],
        cases: [],
        evidenceLabels: {},
        entityLabels: {},
      },
      isFetching: false,
      isError: false,
    });

    fireEvent.change(
      screen.getByPlaceholderText("Search entities, evidence, tasks…"),
      { target: { value: "fo" } }
    );

    await waitFor(() => {
      expect(screen.getByText("Follow up")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Follow up"));

    expect(navigateMock).toHaveBeenCalledWith({
      to: "/tasks",
      search: { entityId, taskId },
    });
  });

  it("shows a loading state while search results are fetching", async () => {
    renderPalette(true, {
      data: undefined,
      isFetching: true,
      isError: false,
    });
    fireEvent.change(
      screen.getByPlaceholderText("Search entities, evidence, tasks…"),
      { target: { value: "ab" } }
    );

    await waitFor(() => {
      expect(screen.getByText("Searching…")).toBeInTheDocument();
    });
  });

  it("shows a retry banner when the search query fails", async () => {
    const refetch = vi.fn();
    renderPalette(true, {
      data: undefined,
      isFetching: false,
      isError: true,
      error: new Error("Network down"),
      refetch,
    });
    fireEvent.change(
      screen.getByPlaceholderText("Search entities, evidence, tasks…"),
      { target: { value: "xy" } }
    );

    await waitFor(() => {
      expect(screen.getByText("Network down")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a retry banner when the cases query fails", () => {
    const retryCases = vi.fn();
    renderPalette(
      true,
      {
        data: undefined,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
      },
      { active: null, cases: [] },
      { loadError: "Cases unavailable", retry: retryCases }
    );

    expect(screen.getByText("Cases unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retryCases).toHaveBeenCalledTimes(1);
  });
});
