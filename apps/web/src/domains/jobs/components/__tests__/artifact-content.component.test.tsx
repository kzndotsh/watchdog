import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
  };
});

import { ArtifactContent } from "@/domains/jobs/components/artifact-content";

describe("ArtifactContent", () => {
  it("renders artifact preview while content is loading", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: false,
      isLoading: true,
      isError: false,
    });

    render(
      <ArtifactContent
        caseId={testId(10)}
        jobId={testId(11)}
        sha256="abc123"
        mime="text/plain"
        name="report.txt"
      />
    );

    expect(screen.getByText("report.txt")).toBeInTheDocument();
  });

  it("renders fetched text for job artifacts", () => {
    useQueryMock.mockReturnValue({
      data: { text: "artifact body" },
      isFetched: true,
      isLoading: false,
      isError: false,
    });

    render(
      <ArtifactContent
        caseId={testId(10)}
        jobId={testId(11)}
        sha256="abc123"
        mime="text/plain"
        name="report.txt"
      />
    );

    expect(screen.getByText("artifact body")).toBeInTheDocument();
  });

  it("shows a fetch error instead of a binary placeholder when content fails", () => {
    const refetch = vi.fn();
    useQueryMock.mockReturnValue({
      data: undefined,
      isFetched: true,
      isLoading: false,
      isError: true,
      error: new Error("storage unavailable"),
      refetch,
    });

    render(
      <ArtifactContent
        caseId={testId(10)}
        jobId={testId(11)}
        sha256="abc123"
        mime="text/plain"
        name="report.txt"
      />
    );

    expect(screen.getByText("storage unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("Binary artifact — not renderable.")
    ).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Retry" }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("loads evidence-backed artifacts by evidence id", () => {
    useQueryMock.mockReturnValue({
      data: { text: "inline evidence" },
      isFetched: true,
      isLoading: false,
      isError: false,
    });

    render(
      <ArtifactContent
        caseId={testId(10)}
        evidenceId={testId(40)}
        mime="text/plain"
        name="note.txt"
      />
    );

    expect(screen.getByText("inline evidence")).toBeInTheDocument();
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: [
          "artifact",
          "evidence",
          testId(10),
          testId(40),
          "text/plain",
        ],
      })
    );
  });
});
