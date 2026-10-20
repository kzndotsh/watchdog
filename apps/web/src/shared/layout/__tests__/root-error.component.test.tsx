import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RootError } from "@/shared/layout/root-error";
import { CHUNK_RELOAD_KEY } from "@/shared/lib/chunk-reload";
import { resetClientErrorReporter } from "@/shared/lib/client-error-reporter";
import {
  createTestRouter,
  destroyTestRouter,
  testRouterWrapper,
} from "@/testing/test-router";

describe("RootError", () => {
  const router = createTestRouter();
  const calls: { url: string; body: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: typeof init?.body === "string" ? init.body : "" });
    return new Response(null, { status: 204 });
  });

  beforeEach(() => {
    resetClientErrorReporter();
    calls.length = 0;
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
  });

  afterEach(() => {
    destroyTestRouter(router);
  });

  function renderScreen(error: Error, reset = vi.fn()) {
    render(<RootError error={error} reset={reset} />, {
      wrapper: testRouterWrapper(router),
    });
    return reset;
  }

  it("shows a calm recovery screen with retry and a way home, and no technical detail", () => {
    renderScreen(new Error("secret internal detail"));

    expect(
      screen.getByRole("heading", { name: "Something went wrong" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to dashboard" })
    ).toHaveAttribute("href", "/");
    expect(
      screen.queryByText(/secret internal detail/)
    ).not.toBeInTheDocument();
  });

  it("retries by resetting the boundary and invalidating the router", async () => {
    const invalidate = vi.spyOn(router, "invalidate").mockResolvedValue();
    const reset = renderScreen(new Error("render crash"));

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("reports the failure to this app's own endpoint", () => {
    renderScreen(new Error("render crash"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls[0]?.url).toBe("/api/client-errors");
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      kind: "render",
      message: "render crash",
    });
  });

  it("does not report a server failure (already logged where it happened)", () => {
    renderScreen(
      Object.assign(new Error("Internal server error"), {
        code: "INTERNAL_SERVER_ERROR",
      })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not report a stale-chunk failure it reloads for", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    renderScreen(
      new TypeError("Failed to fetch dynamically imported module: /assets/a.js")
    );

    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).not.toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
