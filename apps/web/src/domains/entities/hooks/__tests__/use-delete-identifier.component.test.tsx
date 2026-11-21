import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { identifiersKeys } from "@/domains/entities/identifiers/queries";
import { procedureDouble } from "@/testing/orpc-client";

import { useDeleteIdentifier } from "../use-delete-identifier";

const deleteIdentifier = procedureDouble("identifiers.delete");

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
    deleteIdentifier.mockReturnValue(
      new Promise<{ ok: true }>((resolve) => {
        finish = () => {
          resolve({ ok: true });
        };
      })
    );
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    // Each Case has a cached Identifier list: only the Case the deletion started in goes stale.
    for (const caseId of [CASE_A, CASE_B]) {
      queryClient.setQueryData(identifiersKeys.all(caseId), []);
    }
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
      expect(deleteIdentifier).toHaveBeenCalled();
    });
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryState(identifiersKeys.all(CASE_A))?.isInvalidated
      ).toBe(true);
    });
    expect(
      queryClient.getQueryState(identifiersKeys.all(CASE_B))?.isInvalidated
    ).toBe(false);
    expect(deleteIdentifier).toHaveBeenCalledWith({
      caseId: CASE_A,
      identifierId: IDENTIFIER_ID,
    });
    expect(onDeleted).toHaveBeenCalledWith(CASE_B, target);
  });
});
