import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  createIdentifierFn: vi.fn(),
  updateIdentifierFn: vi.fn(),
  deleteIdentifierFn: vi.fn(),
}));

const bulkDialog = vi.hoisted(() => ({
  onImported: undefined as
    | ((entityIds: string[], caseId: string) => Promise<void>)
    | undefined,
}));

vi.mock("@/domains/entities/components/bulk-add-identifiers-dialog", () => ({
  BulkAddIdentifiersDialog: (props: {
    onImported?: (entityIds: string[], caseId: string) => Promise<void>;
  }) => {
    bulkDialog.onImported = props.onImported;
    return null;
  },
}));

vi.mock("@/domains/entities/components/delete-identifier-dialog", () => ({
  DeleteIdentifierDialog: () => null,
}));

vi.mock("@/shared/ui/toast", () => ({
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

import { IdentifiersSection } from "@/domains/dossier/components/identifiers-section";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";

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

const ENTITY = {
  id: testId(20),
  name: "Alpha",
  slug: "alpha",
};

const OTHER_ENTITY = { id: testId(21), name: "Beta", slug: "beta" };

function renderSection() {
  useQueryMock.mockReturnValue(queryLoaded([]));
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <IdentifiersSection
        caseId={testId(10)}
        entityId={ENTITY.id}
        entitySlug={ENTITY.slug}
        entity={ENTITY}
        evidenceOptions={[]}
      />
    </QueryClientProvider>
  );
}

describe("IdentifiersSection", () => {
  it("shows inline empty copy and add controls when there are no identifiers", () => {
    renderSection();
    expect(
      screen.getByText(
        "No identifiers yet — add a handle, email, phone, or other ID."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bulk add" })
    ).toBeInTheDocument();
    expect(useQueryMock).toHaveBeenCalled();
  });

  it("settles the Entity the bulk import wrote to after the screen moves to another Entity", async () => {
    useQueryMock.mockReturnValue(queryLoaded([]));
    const client = new QueryClient();
    const section = (entity: typeof ENTITY) => (
      <QueryClientProvider client={client}>
        <IdentifiersSection
          caseId={testId(10)}
          entityId={entity.id}
          entitySlug={entity.slug}
          entity={entity}
          evidenceOptions={[]}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(section(ENTITY));
    rerender(section(OTHER_ENTITY));

    await bulkDialog.onImported?.([ENTITY.id], testId(10));

    expect(invalidateAfterEntityChanged).toHaveBeenCalledWith(
      client,
      testId(10),
      { entityId: ENTITY.id }
    );
    expect(invalidateAfterEntityChanged).not.toHaveBeenCalledWith(
      client,
      testId(10),
      expect.objectContaining({ entityId: OTHER_ENTITY.id })
    );
  });
});
