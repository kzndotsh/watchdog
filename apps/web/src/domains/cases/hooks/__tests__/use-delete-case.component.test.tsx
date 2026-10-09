import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CaseRecord } from "@/domains/cases/types";
import { asCaseId } from "@watchdog/schemas/shared";

vi.mock("@/auth/server", () => ({ auth: {} }));

const deleteCaseFn = vi.hoisted(() => vi.fn());
const invalidateAfterCaseSwitch = vi.hoisted(() => vi.fn());

vi.mock("@/domains/cases/cases.functions", () => ({ deleteCaseFn }));
vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterCaseSwitch,
}));

import { useDeleteCase } from "../use-delete-case";

const CASE_A = asCaseId("550e8400-e29b-41d4-a716-446655440000");

const caseA: CaseRecord = {
  id: CASE_A,
  name: "Alpha",
  slug: "alpha",
  description: null,
  allowThirdPartyEgress: false,
};

describe("useDeleteCase", () => {
  it("deletes and reports the Case the deletion started for after a re-render", async () => {
    let finish: () => void = () => undefined;
    deleteCaseFn.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    invalidateAfterCaseSwitch.mockResolvedValue(undefined);
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const onDeleted = vi.fn();
    const { result, rerender } = renderHook(
      ({ tag }: { tag: string }) =>
        useDeleteCase({
          onOpenChange: vi.fn(),
          onDeleted: (deleted) => {
            onDeleted(tag, deleted);
          },
        }),
      { wrapper, initialProps: { tag: "first" } }
    );

    act(() => {
      result.current.deleteMutation.mutate(caseA);
    });
    rerender({ tag: "second" });
    await waitFor(() => {
      expect(deleteCaseFn).toHaveBeenCalled();
    });
    await act(async () => {
      finish();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith("second", caseA);
    });
    expect(deleteCaseFn).toHaveBeenCalledWith({ data: { caseId: CASE_A } });
    expect(invalidateAfterCaseSwitch).toHaveBeenCalledWith(queryClient);
  });
});
