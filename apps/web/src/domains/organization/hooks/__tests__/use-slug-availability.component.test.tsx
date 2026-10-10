import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const checkSlug = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({
  authClient: { organization: { checkSlug } },
}));

import { useSlugAvailability } from "@/domains/organization/hooks/use-slug-availability";

const DEBOUNCE_MS = 400;

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function setup(slug: string, current?: string) {
  return renderHook(({ slug: s, current: c }) => useSlugAvailability(s, c), {
    wrapper: wrapperFor(newClient()),
    initialProps: { slug, current },
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  // React commits the debounced value when the first act ends, which starts the
  // query; a second round lets it settle.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("useSlugAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkSlug.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays idle for an empty slug and never calls the server", async () => {
    const { result } = setup("   ");
    await advance(DEBOUNCE_MS * 2);
    expect(result.current).toBe("idle");
    expect(checkSlug).not.toHaveBeenCalled();
  });

  it("stays idle for the slug the organization already has", async () => {
    const { result } = setup("acme", "acme");
    await advance(DEBOUNCE_MS * 2);
    expect(result.current).toBe("idle");
    expect(checkSlug).not.toHaveBeenCalled();
  });

  it("reports checking until the debounce elapses, then available", async () => {
    checkSlug.mockResolvedValue({ data: { status: true }, error: null });
    const { result } = setup("acme");

    expect(result.current).toBe("checking");
    await advance(DEBOUNCE_MS - 1);
    expect(result.current).toBe("checking");
    expect(checkSlug).not.toHaveBeenCalled();

    await advance(1);
    expect(checkSlug).toHaveBeenCalledExactlyOnceWith({ slug: "acme" });
    expect(result.current).toBe("available");
  });

  it("reports taken when the server refuses the slug", async () => {
    checkSlug.mockResolvedValue({ data: null, error: { message: "taken" } });
    const { result } = setup("acme");
    await advance(DEBOUNCE_MS);
    expect(result.current).toBe("taken");
  });

  it("falls back to idle when the check itself fails (the server decides at submit)", async () => {
    checkSlug.mockRejectedValue(new Error("offline"));
    const { result } = setup("acme");
    await advance(DEBOUNCE_MS);
    expect(result.current).toBe("idle");
  });

  it("checks only the last slug of a burst of typing", async () => {
    checkSlug.mockResolvedValue({ data: { status: true }, error: null });
    const { result, rerender } = setup("a");

    await advance(DEBOUNCE_MS - 100);
    rerender({ slug: "ac", current: undefined });
    await advance(DEBOUNCE_MS - 100);
    rerender({ slug: "acm", current: undefined });
    expect(result.current).toBe("checking");
    expect(checkSlug).not.toHaveBeenCalled();

    await advance(DEBOUNCE_MS);
    expect(checkSlug).toHaveBeenCalledExactlyOnceWith({ slug: "acm" });
    expect(result.current).toBe("available");
  });

  it("goes back to checking when the slug changes after a result", async () => {
    checkSlug
      .mockResolvedValueOnce({ data: null, error: { message: "taken" } })
      .mockResolvedValueOnce({ data: { status: true }, error: null });
    const { result, rerender } = setup("acme");
    await advance(DEBOUNCE_MS);
    expect(result.current).toBe("taken");

    rerender({ slug: "acme-2", current: undefined });
    expect(result.current).toBe("checking");
    await advance(DEBOUNCE_MS);
    expect(result.current).toBe("available");
  });

  it("asks the server once when two fields watch the same slug", async () => {
    checkSlug.mockResolvedValue({ data: { status: true }, error: null });
    const wrapper = wrapperFor(newClient());
    const first = renderHook(() => useSlugAvailability("acme"), { wrapper });
    const second = renderHook(() => useSlugAvailability("acme"), { wrapper });

    await advance(DEBOUNCE_MS);
    expect(checkSlug).toHaveBeenCalledTimes(1);
    expect(first.result.current).toBe("available");
    expect(second.result.current).toBe("available");
  });
});
