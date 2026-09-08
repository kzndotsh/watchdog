import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { testId } from "@watchdog/test-kit";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

vi.mock("@/domains/jobs/jobs-artifact.functions", () => ({
  getArtifactContentFn: vi.fn(),
}));

import { artifactContentQuery } from "@/domains/jobs/artifact-queries";
import { jobsKeys } from "@/domains/jobs/jobs-keys";

describe("jobs artifact queries", () => {
  const caseId = testId(1);
  const jobId = testId(2);
  const evidenceId = testId(3);
  const sha256 = "a".repeat(64);

  it("enables artifact queries only when input passes schema validation", () => {
    expect(
      artifactContentQuery({
        source: "job",
        caseId: "case-1",
        jobId,
        sha256: "",
        mime: "text/plain",
      })
    ).toMatchObject({ enabled: false });

    expect(
      artifactContentQuery({
        source: "job",
        caseId,
        jobId: "job-1",
        sha256: "deadbeef",
        mime: "text/plain",
      })
    ).toMatchObject({ enabled: false });

    expect(
      artifactContentQuery({
        source: "job",
        caseId,
        jobId,
        sha256,
        mime: "text/plain",
      })
    ).toMatchObject({
      enabled: true,
      queryKey: jobsKeys.jobArtifact(caseId, jobId, sha256, "text/plain"),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
      meta: { silentError: true },
    });

    expect(
      artifactContentQuery({
        source: "evidence",
        caseId: "case-1",
        evidenceId,
        mime: "text/plain",
      })
    ).toMatchObject({ enabled: false });

    expect(
      artifactContentQuery({
        source: "evidence",
        caseId,
        evidenceId: "ev-1",
        mime: "text/plain",
      })
    ).toMatchObject({ enabled: false });

    expect(
      artifactContentQuery({
        source: "evidence",
        caseId,
        evidenceId,
        mime: "text/plain",
      })
    ).toMatchObject({
      enabled: true,
      queryKey: jobsKeys.evidenceArtifact(caseId, evidenceId, "text/plain"),
    });
  });
});
