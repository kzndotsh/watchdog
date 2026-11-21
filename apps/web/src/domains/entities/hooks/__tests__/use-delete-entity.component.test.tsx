import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { EntityRecord } from "@/domains/entities/types";

const invalidateAfterEntityChanged = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/app/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged,
}));

import { procedureDouble } from "@/testing/orpc-client";

import { useDeleteEntity } from "../use-delete-entity";

const deleteEntity = procedureDouble("entities.delete");

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
    deleteEntity.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        finish = () => {
          resolve({ ok: true });
        };
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
    await waitFor(() => {
      expect(deleteEntity).toHaveBeenCalled();
    });
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
    expect(deleteEntity).toHaveBeenCalledWith({
      caseId: CASE_A,
      entityId: ENTITY_ID,
    });
    expect(onDeleted).toHaveBeenCalledWith(CASE_B, entity);
  });
});
