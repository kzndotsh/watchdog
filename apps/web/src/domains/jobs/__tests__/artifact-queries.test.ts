import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { artifactContentQuery } from "@/domains/jobs/artifact-queries";
import { artifactKeys } from "@/domains/jobs/jobs-keys";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { procedureDouble } from "@/testing/orpc-client";
import { testId } from "@watchdog/domain/test-kit";

const artifactText = procedureDouble("jobs.artifactText");
const evidenceText = procedureDouble("evidence.text");

describe("artifact content reads", () => {
  const caseId = testId(1);
  const jobId = testId(2);
  const evidenceId = testId(3);
  const sha256 = "a".repeat(64);

  it("reads a text-shaped Job artifact by its hash", async () => {
    artifactText.mockResolvedValue({ text: "key: value" });
    await expect(
      new QueryClient().query(
        artifactContentQuery({
          source: "job",
          caseId,
          jobId,
          sha256,
          mime: "application/yaml",
        })
      )
    ).resolves.toEqual({ text: "key: value" });
    expect(artifactText).toHaveBeenCalledWith({ caseId, jobId, sha256 });
  });

  it("asks nothing for a binary Job artifact", async () => {
    await expect(
      new QueryClient().query(
        artifactContentQuery({
          source: "job",
          caseId,
          jobId,
          sha256,
          mime: "application/octet-stream",
        })
      )
    ).resolves.toEqual({ text: null });
    expect(artifactText).not.toHaveBeenCalled();
  });

  it("reads an Evidence body whatever its mime (the caller gates on it)", async () => {
    evidenceText.mockResolvedValue({ text: "attested" });
    await expect(
      new QueryClient().query(
        artifactContentQuery({
          source: "evidence",
          caseId,
          evidenceId,
          mime: "application/octet-stream",
        })
      )
    ).resolves.toEqual({ text: "attested" });
    expect(evidenceText).toHaveBeenCalledWith({ caseId, evidenceId });
  });
});

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
      queryKey: artifactKeys.job(caseId, jobId, sha256, "text/plain"),
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
      queryKey: artifactKeys.evidence(caseId, evidenceId, "text/plain"),
    });
  });
});
