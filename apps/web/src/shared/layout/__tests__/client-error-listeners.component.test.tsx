import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClientErrorListeners } from "@/shared/layout/client-error-listeners";
import { resetClientErrorReporter } from "@/shared/lib/client-error-reporter";

const chunkError = new TypeError(
  "Failed to fetch dynamically imported module: /assets/a.js"
);

function rejection(reason: unknown): Event {
  return Object.assign(new Event("unhandledrejection"), { reason });
}

describe("ClientErrorListeners", () => {
  const bodies: string[] = [];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(typeof init?.body === "string" ? init.body : "");
    return new Response(null, { status: 204 });
  });
  const reload = vi.fn();

  beforeEach(() => {
    resetClientErrorReporter();
    bodies.length = 0;
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { pathname: "/", reload });
  });

  it("reports an unhandled rejection", () => {
    render(<ClientErrorListeners />);
    window.dispatchEvent(rejection(new Error("lost promise")));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({
      kind: "unhandledrejection",
      message: "lost promise",
    });
  });

  it("reports an uncaught error, but not an opaque cross-origin one", () => {
    render(<ClientErrorListeners />);
    window.dispatchEvent(new ErrorEvent("error", { message: "Script error." }));
    expect(fetchMock).not.toHaveBeenCalled();

    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("kaboom"), message: "kaboom" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the same failure once per page and caps the total", () => {
    render(<ClientErrorListeners />);
    for (let i = 0; i < 3; i += 1) {
      window.dispatchEvent(rejection(new Error("same")));
    }
    for (let i = 0; i < 10; i += 1) {
      window.dispatchEvent(rejection(new Error(`distinct ${i}`)));
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("reloads once for a chunk-load rejection and never loops", () => {
    render(<ClientErrorListeners />);

    window.dispatchEvent(rejection(chunkError));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();

    // after the reload the chunk still fails: report it instead of reloading again
    window.dispatchEvent(rejection(chunkError));
    window.dispatchEvent(rejection(chunkError));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles Vite's preload error: reloads once and cancels the throw", () => {
    render(<ClientErrorListeners />);
    const first = Object.assign(
      new Event("vite:preloadError", { cancelable: true }),
      { payload: chunkError }
    );
    window.dispatchEvent(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);

    const second = Object.assign(
      new Event("vite:preloadError", { cancelable: true }),
      { payload: chunkError }
    );
    window.dispatchEvent(second);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it("stops listening when unmounted", () => {
    const { unmount } = render(<ClientErrorListeners />);
    unmount();
    window.dispatchEvent(rejection(new Error("after unmount")));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failing report never throws into the page", () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    render(<ClientErrorListeners />);
    expect(() => {
      window.dispatchEvent(rejection(new Error("x")));
    }).not.toThrow();
  });
});
