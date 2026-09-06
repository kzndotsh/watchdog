import {
  QueryClient,
  type QueryClient as QueryClientType,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

import {
  ensureCollectEvidenceBlobWhenSelected,
  ensureCollectJobDetailWhenSelected,
  ensureCollectQueueQueries,
  warmCollectCatalogQueries,
  warmCollectQueries,
} from "@/domains/collect/lib/prefetch-collect";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import {
  artifactContentQuery,
  capabilitiesListQuery,
  jobDetailQuery,
  jobsListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { credentialsListQuery } from "@/domains/settings/queries";

describe("ensureCollectQueueQueries", () => {
  it("awaits evidence, jobs, and entities together", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const client = { query } as unknown as QueryClientType;

    await ensureCollectQueueQueries(client, "case-1");

    expect(query).toHaveBeenCalledTimes(3);
    const ensuredKeys = query.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(ensuredKeys).toContainEqual(evidenceListQuery("case-1").queryKey);
    expect(ensuredKeys).toContainEqual(jobsListQuery("case-1").queryKey);
    expect(ensuredKeys).toContainEqual(entitiesListQuery("case-1").queryKey);
  });
});

describe("warmCollectCatalogQueries", () => {
  it("revalidates catalogs and prefetches hidden evidence in the background", async () => {
    const client = new QueryClient();
    const query = vi.spyOn(client, "query").mockResolvedValue(undefined);

    warmCollectCatalogQueries(client, "case-1");
    await Promise.resolve();

    const ensuredKeys = query.mock.calls.map(
      ([options]) => (options as { queryKey: readonly unknown[] }).queryKey
    );
    expect(ensuredKeys).toContainEqual(capabilitiesListQuery().queryKey);
    expect(ensuredKeys).toContainEqual(playbooksListQuery().queryKey);
    expect(ensuredKeys).toContainEqual(credentialsListQuery().queryKey);
    expect(ensuredKeys).toContainEqual(evidenceListQuery("case-1").queryKey);
    expect(ensuredKeys).toContainEqual(jobsListQuery("case-1").queryKey);
    expect(query).toHaveBeenCalledTimes(6);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: evidenceListQuery("case-1", { hiddenOnly: true }).queryKey,
      })
    );
  });
});

describe("ensureCollectEvidenceBlobWhenSelected", () => {
  it("awaits artifact content for uri-backed json evidence", async () => {
    const evidenceId = "00000000-0000-4000-8000-000000000010";
    const query = vi
      .fn()
      .mockImplementation((options: { queryKey: readonly unknown[] }) => {
        const key = options.queryKey[0];
        if (key === "evidence") {
          return Promise.resolve([
            {
              id: evidenceId,
              text: null,
              uri: "s3://bucket/key",
              mime: "application/json",
            },
          ]);
        }
        if (key === "jobs") return Promise.resolve([]);
        if (key === "artifact") return Promise.resolve({ text: '{"ok":true}' });
        return Promise.resolve(undefined);
      });
    const client = { query } as unknown as QueryClientType;

    await ensureCollectEvidenceBlobWhenSelected(client, "case-1", evidenceId);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: artifactContentQuery({
          source: "evidence",
          caseId: "case-1",
          evidenceId,
          mime: "application/json",
        }).queryKey,
      })
    );
  });
});

describe("warmCollectQueries", () => {
  it("prefetches job detail when selectedId resolves to a job-only row", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const query = vi
      .fn()
      .mockImplementation((options: { queryKey: readonly unknown[] }) => {
        const key = options.queryKey[0];
        if (key === "evidence") return Promise.resolve([]);
        if (key === "jobs") {
          return Promise.resolve([
            {
              id: jobId,
              playbookRunId: runId,
              playbookStep: 1,
              capabilityId: "cap.test",
              status: "running",
              createdAt: "2026-01-01T00:00:00.000Z",
              evidenceIds: [],
              input: {},
            },
          ]);
        }
        return Promise.resolve(undefined);
      });
    const client = { query } as unknown as QueryClientType;

    await ensureCollectJobDetailWhenSelected(client, "case-1", runId);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: jobDetailQuery("case-1", jobId).queryKey,
      })
    );
  });

  it("delegates catalog warm to warmCollectCatalogQueries", () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const client = { query } as unknown as QueryClientType;

    warmCollectQueries(client, "case-1");

    expect(query).toHaveBeenCalled();
    expect(query).toHaveBeenCalled();
  });
});
