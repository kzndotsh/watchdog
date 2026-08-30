import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  createEdgeFn: vi.fn(),
  updateEdgeFn: vi.fn(),
  deleteEdgeFn: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/domains/dossier/components/ego-graph/connection-dialog", () => ({
  ConnectionDialog: () => null,
}));

vi.mock("@/domains/dossier/components/ego-graph/connection-list", () => ({
  CompactConnectionList: () => <div>Connection list</div>,
}));

vi.mock(
  "@/domains/dossier/components/ego-graph/ego-neighborhood-canvas",
  () => ({
    EgoNeighborhoodCanvas: () => <div>Ego graph</div>,
  })
);

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());
const useSuspenseQueriesMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
    useSuspenseQueries: (options: { queries: unknown[] }) =>
      useSuspenseQueriesMock(options),
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import { ConnectionsSection } from "@/domains/dossier/components/connections-section";

const ENTITY = {
  id: testId(1),
  name: "Alpha",
  slug: "alpha",
  kind: "person" as const,
};

function renderSection() {
  useSuspenseQueriesMock.mockReturnValue([{ data: [] }, { data: [] }]);

  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <ConnectionsSection
        caseId={testId(10)}
        entityId={ENTITY.id}
        entitySlug={ENTITY.slug}
        entity={ENTITY}
        evidenceOptions={[]}
      />
    </QueryClientProvider>
  );
}

describe("ConnectionsSection", () => {
  it("shows inline empty copy and add control when there are no edges", () => {
    renderSection();
    expect(
      screen.getByText("No connections to other entities yet.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connections" })
    ).toBeInTheDocument();
    expect(useSuspenseQueriesMock).toHaveBeenCalled();
  });
});
