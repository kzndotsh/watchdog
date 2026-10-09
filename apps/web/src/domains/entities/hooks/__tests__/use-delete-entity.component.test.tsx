import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";

vi.mock("@/auth/server", () => ({ auth: {} }));

const deleteEntityFn = vi.hoisted(() => vi.fn());
const invalidateAfterEntityChanged = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/entities.functions", () => ({ deleteEntityFn }));
vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged,
}));

import { useDeleteEntity } from "../use-delete-entity";

const CASE_A = "550e8400-e29b-41d4-a716-446655440000";
const CASE_B = "550e8400-e29b-41d4-a716-446655440001";
const ENTITY_ID = "550e8400-e29b-41d4-a716-446655440002";

const entity: Pick<EntityRecord, "id" | "name" | "slug"> = {
  id: ENTITY_ID,
  name: "Acme",
  slug: "acme",
};

describe("useDeleteEntity", () => {
  it("settles the Case the deletion started in after the screen moves to another Case", async () => {
    let finish: () => void = () => undefined;
    deleteEntityFn.mockReturnValue(
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
        useDeleteEntity({
          onOpenChange: vi.fn(),
          onDeleted: (deleted) => {
            onDeleted(tag, deleted);
          },
        }),
      { wrapper, initialProps: { tag: CASE_A } }
    );

    act(() => {
      result.current.deleteMutation.mutate({ caseId: CASE_A, entity });
    });
    rerender({ tag: CASE_B });
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(invalidateAfterEntityChanged).toHaveBeenCalledWith(
        queryClient,
        CASE_A
      );
    });
    expect(invalidateAfterEntityChanged).not.toHaveBeenCalledWith(
      queryClient,
      CASE_B
    );
    expect(deleteEntityFn).toHaveBeenCalledWith({
      data: { caseId: CASE_A, entityId: ENTITY_ID },
    });
    expect(onDeleted).toHaveBeenCalledWith(CASE_B, entity);
  });
});
