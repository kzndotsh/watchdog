import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderCallsSection } from "@/domains/jobs/components/provider-calls/provider-calls-section";
import { jobProviderCallsQuery } from "@/domains/jobs/queries";
import { capabilityLabel } from "@/shared/ui/vocab";
import {
  buildProviderCallList,
  buildProviderCallRecord,
} from "@/testing/records";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listJobProviderCallsFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/jobs/jobs.functions", () => ({
  listJobProviderCallsFn,
  getJobFn: vi.fn(),
  getPlaybookRunFn: vi.fn(),
  listCapabilitiesFn: vi.fn(),
  listJobsFn: vi.fn(),
  listPlaybooksFn: vi.fn(),
}));

const CASE_ID = testCaseId(10);
const JOB_ID = testId(11);

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection(subject: "job" | "evidence" = "job") {
  return render(
    <ProviderCallsSection
      caseId={CASE_ID}
      options={jobProviderCallsQuery(CASE_ID, JOB_ID)}
      subject={subject}
    />,
    { wrapper: Providers }
  );
}

describe("ProviderCallsSection", () => {
  beforeEach(() => {
    listJobProviderCallsFn.mockReset();
  });

  it("shows a call's method, redacted URL as text, result, transport, time, size, hash, Cap and version", async () => {
    listJobProviderCallsFn.mockResolvedValue(buildProviderCallList());

    renderSection();

    expect(await screen.findByText("GET")).toBeInTheDocument();
    expect(
      screen.getByText("https://provider.test/v1/host?key=[redacted]")
    ).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("HTTP")).toBeInTheDocument();
    expect(screen.getByText("120 ms")).toBeInTheDocument();
    expect(screen.getByText(/Stored · 2\.0 KiB/)).toBeInTheDocument();
    expect(screen.getByText(/text\/html; charset=utf-8/)).toBeInTheDocument();
    expect(
      screen.getByText(capabilityLabel("network.dns.lookup"))
    ).toBeInTheDocument();
    expect(screen.getByText("Body hash")).toBeInTheDocument();
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText("Cap")).toBeInTheDocument();
  });

  it("shows the URL as text, never as a link to the provider", async () => {
    listJobProviderCallsFn.mockResolvedValue(buildProviderCallList());

    renderSection();

    await screen.findByText("GET");
    const hrefs = screen
      .queryAllByRole("link")
      .map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.startsWith("https://"))).toBe(false);
  });

  it("offers the raw response as a download only when it is stored", async () => {
    const stored = buildProviderCallRecord({ id: testId(61) });
    const hashed = buildProviderCallRecord({
      id: testId(62),
      url: "https://provider.test/v1/other",
      body: {
        kind: "response",
        state: "hashed",
        reason: "hash_only",
        sha256: "b".repeat(64),
        bytes: 99,
        contentType: "application/json",
        isDownloadable: false,
      },
    });
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({ calls: [stored, hashed] })
    );

    renderSection();

    await screen.findByText("https://provider.test/v1/other");
    const downloads = screen.getAllByRole("button", {
      name: /Download the raw response/,
    });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toHaveAttribute(
      "href",
      `/api/v1/cases/${CASE_ID}/provider-calls/${stored.id}/response`
    );
    expect(downloads[0]).toHaveAttribute("download");
    expect(
      screen.getByText(/Not stored \(hash only by policy\)/)
    ).toBeInTheDocument();
  });

  it("shows a failed call and a call with no outcome as such", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        calls: [
          buildProviderCallRecord({
            id: testId(61),
            outcome: "failed",
            status: null,
            failureReason: "timeout",
            body: null,
          }),
          buildProviderCallRecord({
            id: testId(62),
            outcome: null,
            status: null,
            durationMs: null,
            body: null,
          }),
        ],
      })
    );

    renderSection();

    expect(await screen.findByText("Failed (timeout)")).toBeInTheDocument();
    expect(screen.getByText("No outcome recorded")).toBeInTheDocument();
  });

  it("shows an incomplete record as incomplete, never as no calls", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({ provenance: "incomplete", calls: [] })
    );

    renderSection();

    expect(
      await screen.findByText(/provider-call record is incomplete/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No provider calls recorded")
    ).not.toBeInTheDocument();
  });

  it("keeps the incomplete warning above the calls that were saved", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({ provenance: "incomplete" })
    );

    renderSection();

    expect(
      await screen.findByText(/provider-call record is incomplete/)
    ).toBeInTheDocument();
    expect(screen.getByText("GET")).toBeInTheDocument();
  });

  it("says no calls were recorded when the record is whole and empty", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({ calls: [] })
    );

    renderSection();

    expect(
      await screen.findByText("No provider calls recorded")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/provider-call record is incomplete/)
    ).not.toBeInTheDocument();
  });

  it("names the source Job of a cache hit", async () => {
    const sourceJobId = testId(77);
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        calls: [],
        cacheHits: [{ jobId: JOB_ID, sourceJobId }],
      })
    );

    renderSection();

    const note = await screen.findByText(/this Job reused a cached result/);
    expect(note).toHaveTextContent("Served from cache");
    expect(within(note).getByText(/^[0-9a-f]{8}/)).toBeInTheDocument();
    expect(screen.queryByText("No provider calls recorded")).toBeNull();
  });

  it("shows a cache hit whose source is outside the Case without following it", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        calls: [],
        cacheHits: [{ jobId: JOB_ID, sourceJobId: null }],
      })
    );

    renderSection();

    expect(
      await screen.findByText(
        "Served from cache: this Job reused a cached result. The Job it came from is not in this Case."
      )
    ).toBeInTheDocument();
  });

  it("words a cache hit for Evidence as Evidence", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        cacheHits: [{ jobId: JOB_ID, sourceJobId: null }],
      })
    );

    renderSection("evidence");

    expect(
      await screen.findByText(/this Evidence came from a cached result/)
    ).toBeInTheDocument();
  });

  it("shows a served-from-cache call with its original call, or without it outside the Case", async () => {
    const originalJobId = testId(78);
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        calls: [
          buildProviderCallRecord({
            id: testId(61),
            outcome: "served_from",
            status: null,
            isServedFromCache: true,
            original: { callId: testId(62), jobId: originalJobId },
            body: null,
          }),
          buildProviderCallRecord({
            id: testId(63),
            outcome: "served_from",
            status: null,
            isServedFromCache: true,
            original: null,
            body: null,
          }),
        ],
      })
    );

    renderSection();

    expect(await screen.findByText(/Original call in Job/)).toBeInTheDocument();
    expect(
      screen.getByText("Cache. The original call is not in this Case.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Served from cache")).toHaveLength(2);
  });

  it("says when the cache hits were cut", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({
        calls: [],
        cacheHits: [{ jobId: JOB_ID, sourceJobId: null }],
        areCacheHitsTruncated: true,
      })
    );

    renderSection();

    expect(
      await screen.findByText("Showing the first 1 cache hits.")
    ).toBeInTheDocument();
  });

  it("says when the list was cut", async () => {
    listJobProviderCallsFn.mockResolvedValue(
      buildProviderCallList({ isTruncated: true })
    );

    renderSection();

    expect(
      await screen.findByText("Showing the first 1 calls.")
    ).toBeInTheDocument();
  });

  it("shows a load error with a retry that reads again", async () => {
    const user = userEvent.setup();
    listJobProviderCallsFn.mockRejectedValueOnce(new Error("boom"));
    listJobProviderCallsFn.mockResolvedValue(buildProviderCallList());

    renderSection();

    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByText("boom")).toBeInTheDocument();
    await user.click(retry);
    expect(await screen.findByText("GET")).toBeInTheDocument();
  });

  it("falls back to house copy when the failure has no message", async () => {
    listJobProviderCallsFn.mockRejectedValue(undefined);

    renderSection();

    expect(
      await screen.findByText("Couldn't load provider calls")
    ).toBeInTheDocument();
  });

  it("shows a loading state while the calls are read", () => {
    listJobProviderCallsFn.mockReturnValue(
      new Promise<never>(() => {
        // Never settles: the read stays in flight.
      })
    );

    renderSection();

    expect(screen.getByText("Loading provider calls")).toBeInTheDocument();
  });
});
