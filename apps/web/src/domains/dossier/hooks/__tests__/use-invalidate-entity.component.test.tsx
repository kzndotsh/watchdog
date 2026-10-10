import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterEntityChanged: vi.fn().mockResolvedValue(undefined),
}));

import { useInvalidateEntity } from "@/domains/dossier/hooks/use-invalidate-entity";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";

const CASE = "11111111-1111-4111-8111-000000000010";
const ENTITY = "11111111-1111-4111-8111-000000000020";

describe("useInvalidateEntity", () => {
  it("delegates to the shared entity invalidation contract", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInvalidateEntity(), { wrapper });

    await result.current({
      caseId: CASE,
      entityId: ENTITY,
      entitySlug: "alpha",
    });
    expect(invalidateAfterEntityChanged).toHaveBeenCalledWith(client, CASE, {
      entityId: ENTITY,
      slug: "alpha",
    });
  });

  it("resolves a missing slug from the cached Entity list of the given Case", async () => {
    const client = new QueryClient();
    client.setQueryData(entitiesKeys.all(CASE), [{ id: ENTITY, slug: "beta" }]);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInvalidateEntity(), { wrapper });

    await result.current({ caseId: CASE, entityId: ENTITY });

    expect(invalidateAfterEntityChanged).toHaveBeenCalledWith(client, CASE, {
      entityId: ENTITY,
      slug: "beta",
    });
  });
});
