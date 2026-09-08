import { describe, expect, it, vi } from "vitest";

const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { error: toastErrorMock },
}));

import { createAppQueryClient } from "@/shared/lib/query-client";

describe("createAppQueryClient", () => {
  it("does not retry auth failures and retries other errors once", () => {
    const client = createAppQueryClient();
    const retry = client.getDefaultOptions().queries?.retry as (
      count: number,
      error: Error
    ) => boolean;

    expect(retry(1, new Error("Unauthorized"))).toBe(false);
    expect(retry(0, new Error("network down"))).toBe(true);
    expect(retry(1, new Error("network down"))).toBe(false);
  });

  it("toasts query errors unless marked silent", () => {
    const client = createAppQueryClient();
    const cache = client.getQueryCache();

    cache.config.onError?.(new Error("boom"), { meta: {} } as never);
    expect(toastErrorMock).toHaveBeenCalledWith("boom");

    toastErrorMock.mockClear();
    cache.config.onError?.(new Error("quiet"), {
      meta: { silentError: true },
    } as never);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
