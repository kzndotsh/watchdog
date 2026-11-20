import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as baseRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

const getArtifactContentFn = vi.hoisted(() =>
  vi.fn(async () => ({ text: "# Enriched page" }))
);
vi.mock("@/domains/jobs/jobs-artifact.functions", () => ({
  getArtifactContentFn,
}));

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return baseRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

import { EvidenceOutputTab } from "@/domains/intake/components/evidence-output-tab";
import { buildJobListRecord } from "@/testing/records";
import { ENRICHED_MD_ARTIFACT } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";

const CASE_ID = testCaseId(1);

function output(name: string) {
  const job = buildJobListRecord({ status: "succeeded" });
  return {
    job,
    artifact: { name, mime: "text/markdown", uri: "u", sha256: "a".repeat(64) },
  };
}

describe("EvidenceOutputTab", () => {
  it("says Enrich is running while it has no output", () => {
    render(
      <EvidenceOutputTab caseId={CASE_ID} isEnrichRunning enrichOutput={null} />
    );
    expect(screen.getByText(/Enrich running/)).toBeInTheDocument();
  });

  it("shows the combined Enrich output, naming a fallback artifact", async () => {
    const { rerender } = render(
      <EvidenceOutputTab
        caseId={CASE_ID}
        isEnrichRunning={false}
        enrichOutput={output(ENRICHED_MD_ARTIFACT)}
      />
    );
    expect(await screen.findByText(/Enriched page/)).toBeInTheDocument();
    expect(screen.queryByText(/fallback/)).not.toBeInTheDocument();

    rerender(
      <EvidenceOutputTab
        caseId={CASE_ID}
        isEnrichRunning={false}
        enrichOutput={output("live.md")}
      />
    );
    expect(screen.getByText(/fallback live\.md/)).toBeInTheDocument();
  });

  it("explains how to get output when there is none", () => {
    render(
      <EvidenceOutputTab
        caseId={CASE_ID}
        isEnrichRunning={false}
        enrichOutput={null}
      />
    );
    expect(screen.getByText("No Enrich output yet")).toBeInTheDocument();
  });
});
