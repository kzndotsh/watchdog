import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EventRecord } from "@/domains/entities/events/events.functions";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/events/events.functions", () => ({
  createEventFn: vi.fn(),
  updateEventFn: vi.fn(),
  deleteEventFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import { EventsSection } from "@/domains/dossier/components/events-section";

function queryLoaded<T>(data: T) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
}

const EVENT: EventRecord = {
  id: testId(1),
  entityId: testId(20),
  when: "2026-01-15",
  what: "Met at the office",
  where: "NYC",
};

function renderSection(events: EventRecord[]) {
  useQueryMock.mockReturnValue(queryLoaded(events));
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <EventsSection
        caseId={testId(10)}
        entityId={testId(20)}
        entitySlug="alpha"
      />
    </QueryClientProvider>
  );
}

describe("EventsSection", () => {
  it("shows inline empty copy when there are no events", () => {
    renderSection([]);
    expect(
      screen.getByText("No events yet — add a dated milestone.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders timeline rows for existing events", () => {
    renderSection([EVENT]);
    expect(screen.getByText("Met at the office")).toBeInTheDocument();
    expect(screen.getByText(/2026-01-15/)).toBeInTheDocument();
    expect(screen.getByText(/@ NYC/)).toBeInTheDocument();
  });
});
