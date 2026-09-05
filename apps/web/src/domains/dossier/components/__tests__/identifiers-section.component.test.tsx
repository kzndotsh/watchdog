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

vi.mock("@/domains/entities/components/bulk-add-identifiers-dialog", () => ({
  BulkAddIdentifiersDialog: () => null,
}));

vi.mock("@/domains/entities/components/delete-identifier-dialog", () => ({
  DeleteIdentifierDialog: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

const useSuspenseQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useSuspenseQuery: (...args: unknown[]) => useSuspenseQueryMock(...args),
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

import { IdentifiersSection } from "@/domains/dossier/components/identifiers-section";

const ENTITY = {
  id: testId(20),
  name: "Alpha",
  slug: "alpha",
};

function renderSection() {
  useSuspenseQueryMock.mockReturnValue({ data: [] });
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
    expect(useSuspenseQueryMock).toHaveBeenCalled();
  });
});
