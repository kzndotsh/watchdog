import { describe, expect, it, vi, beforeEach } from "vitest";

import type { GetArtifactContentInput } from "@/domains/jobs/types";
import { testHttpUrl, testId } from "@watchdog/test-kit";

const downloadUrlMock = vi.hoisted(() => vi.fn());
const jobsGetMock = vi.hoisted(() => vi.fn());
const readArtifactBytesMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({
    evidence: { downloadUrl: downloadUrlMock },
    jobs: { get: jobsGetMock },
  }),
}));

vi.mock("@watchdog/api", () => ({
  runApp: (effect: unknown) => readArtifactBytesMock(effect),
}));

vi.mock("@watchdog/core/blob", () => ({
  readArtifactBytesEffect: (uri: string) => uri,
}));

import { fetchArtifactContent } from "@/domains/jobs/jobs-artifact.server";

const caseId = testId(10);
const evidenceId = testId(40);
const jobId = testId(50);

const evidenceInput: GetArtifactContentInput = {
  source: "evidence",
  caseId,
  evidenceId,
  mime: "application/octet-stream",
};

describe("fetchArtifactContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches evidence blob text without mime gating (attestation uri-backed)", async () => {
    const blobUrl = testHttpUrl("blob.test/attestation");
    downloadUrlMock.mockResolvedValue({ url: blobUrl });
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("attestation body"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchArtifactContent(evidenceInput, {} as never);

    expect(downloadUrlMock).toHaveBeenCalledWith({ caseId, evidenceId });
    expect(fetchMock).toHaveBeenCalledWith(blobUrl);
    expect(result).toEqual({ text: "attestation body" });
  });

  it("still skips binary job artifacts when mime is not text-shaped", async () => {
    const result = await fetchArtifactContent(
      {
        source: "job",
        caseId,
        jobId,
        sha256: "deadbeef",
        mime: "image/png",
      },
      {} as never
    );

    expect(jobsGetMock).not.toHaveBeenCalled();
    expect(result).toEqual({ text: null });
  });

  it("fetches text-shaped job artifacts for yaml mimes", async () => {
    const uri = `${caseId}/artifacts/output.yaml`;
    jobsGetMock.mockResolvedValue({
      output: [{ sha256: "deadbeef", uri }],
    });
    readArtifactBytesMock.mockResolvedValue(
      new TextEncoder().encode("key: value")
    );

    const result = await fetchArtifactContent(
      {
        source: "job",
        caseId,
        jobId,
        sha256: "deadbeef",
        mime: "text/yaml",
      },
      {} as never
    );

    expect(jobsGetMock).toHaveBeenCalledWith({ caseId, jobId });
    expect(readArtifactBytesMock).toHaveBeenCalledWith(uri);
    expect(result).toEqual({ text: "key: value" });
  });
});
