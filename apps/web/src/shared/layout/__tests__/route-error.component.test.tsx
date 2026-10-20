import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RouteError } from "@/shared/layout/route-error";
import { resetClientErrorReporter } from "@/shared/lib/client-error-reporter";

describe("RouteError", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

  beforeEach(() => {
    resetClientErrorReporter();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows the fetch error message from route errors", () => {
    render(<RouteError error={new Error("Case not found")} reset={() => {}} />);
    expect(screen.getByText("Case not found")).toBeInTheDocument();
  });

  it("reports a failure that is not a server failure", () => {
    render(<RouteError error={new Error("render crash")} reset={() => {}} />);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
