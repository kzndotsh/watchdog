import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CASES_CHANGED_EVENT } from "@/domains/cases/lib/active-case";
import { casesKeys } from "@/domains/cases/queries";
import { useCasesChangedInvalidation } from "@/shared/hooks/use-cases-changed-invalidation";

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi
    .spyOn(queryClient, "invalidateQueries")
    .mockResolvedValue(undefined);
  vi.spyOn(queryClient, "refetchQueries").mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

describe("useCasesChangedInvalidation", () => {
  it("settles the cases slice when the Active Case switches", async () => {
    const { invalidate, wrapper } = setup();
    renderHook(() => useCasesChangedInvalidation(), { wrapper });

    window.dispatchEvent(new Event(CASES_CHANGED_EVENT));

    await vi.waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: casesKeys.all,
        refetchType: "none",
      });
    });
  });

  it("stops listening on unmount", () => {
    const { invalidate, wrapper } = setup();
    const { unmount } = renderHook(() => useCasesChangedInvalidation(), {
      wrapper,
    });
    unmount();

    window.dispatchEvent(new Event(CASES_CHANGED_EVENT));

    expect(invalidate).not.toHaveBeenCalled();
  });
});
