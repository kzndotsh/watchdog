import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const deleteIdentifierFn = vi.hoisted(() => vi.fn());
const invalidateAfterEntityChanged = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  deleteIdentifierFn,
}));
vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged,
}));

import { useDeleteIdentifier } from "../use-delete-identifier";

const CASE_A = "550e8400-e29b-41d4-a716-446655440000";
const CASE_B = "550e8400-e29b-41d4-a716-446655440001";
const ENTITY_ID = "550e8400-e29b-41d4-a716-446655440002";
const IDENTIFIER_ID = "550e8400-e29b-41d4-a716-446655440003";

const target = {
  id: IDENTIFIER_ID,
  type: "email",
  value: "a@example.com",
  entityId: ENTITY_ID,
  entitySlug: "acme",
};

describe("useDeleteIdentifier", () => {
  it("settles the Case the deletion started in after the screen moves to another Case", async () => {
    let finish: () => void = () => undefined;
    deleteIdentifierFn.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    invalidateAfterEntityChanged.mockResolvedValue(undefined);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const onDeleted = vi.fn();
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useDeleteIdentifier({
          onOpenChange: vi.fn(),
          onDeleted: (deleted) => {
            onDeleted(tag, deleted);
          },
        }),
      { wrapper, initialProps: { tag: CASE_A } }
    );

    act(() => {
      result.current.deleteMutation.mutate({ caseId: CASE_A, target });
    });
    rerender({ tag: CASE_B });
    await waitFor(() => {
      expect(deleteIdentifierFn).toHaveBeenCalled();
    });
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(invalidateAfterEntityChanged).toHaveBeenCalledWith(
        queryClient,
        CASE_A,
        { entityId: ENTITY_ID, slug: "acme" }
      );
    });
    expect(invalidateAfterEntityChanged).not.toHaveBeenCalledWith(
      queryClient,
      CASE_B,
      expect.anything()
    );
    expect(deleteIdentifierFn).toHaveBeenCalledWith({
      data: { caseId: CASE_A, identifierId: IDENTIFIER_ID },
    });
    expect(onDeleted).toHaveBeenCalledWith(CASE_B, target);
  });
});
