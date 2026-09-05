import { createServerFn } from "@tanstack/react-start";

import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  getArtifactContentInputSchema,
  getJobInputSchema,
  listJobsInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
  type CapListItem,
  type GetArtifactContentInput,
  type PlaybookListItem,
} from "@/domains/jobs/types";
import { orpcFromContext } from "@/lib/orpc.server";
import { runApp } from "@watchdog/api";
import { readArtifactBytesEffect } from "@watchdog/core";
import type { JobListRecord, JobRecord } from "@watchdog/core";

export type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
export type { JobListRecord, JobRecord } from "@watchdog/core";

type OrpcFnContext = Parameters<typeof orpcFromContext>[0];

export const listCapabilitiesFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<CapListItem[]> =>
    await orpcFromContext(context).capabilities.list()
);

export const listPlaybooksFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<PlaybookListItem[]> =>
    (await orpcFromContext(
      context
    ).capabilities.listPlaybooks()) as PlaybookListItem[]
);

export const listJobsFn = createServerFn({ method: "GET" })
  .validator(listJobsInputSchema)
  .handler(
    async ({ data, context }): Promise<JobListRecord[]> =>
      await orpcFromContext(context).jobs.listForCase({
        caseId: data.caseId,
      })
  );

export const getJobFn = createServerFn({ method: "GET" })
  .validator(getJobInputSchema)
  .handler(
    async ({ data, context }): Promise<JobRecord> =>
      await orpcFromContext(context).jobs.get({
        caseId: data.caseId,
        jobId: data.jobId,
      })
  );

export const startJobFn = createServerFn({ method: "POST" })
  .validator(startJobInputSchema)
  .handler(
    async ({ data, context }): Promise<JobRecord> =>
      await orpcFromContext(context).jobs.start(data)
  );

export const cancelJobFn = createServerFn({ method: "POST" })
  .validator(cancelJobInputSchema)
  .handler(
    async ({ data, context }): Promise<JobRecord> =>
      await orpcFromContext(context).jobs.cancel(data)
  );

export const startPlaybookFn = createServerFn({ method: "POST" })
  .validator(startPlaybookInputSchema)
  .handler(
    async ({ data, context }) =>
      await orpcFromContext(context).jobs.startPlaybook(data)
  );

export const cancelPlaybookFn = createServerFn({ method: "POST" })
  .validator(cancelPlaybookInputSchema)
  .handler(
    async ({ data, context }) =>
      await orpcFromContext(context).jobs.cancelPlaybook(data)
  );

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript")
  );
}

function truncateArtifactText(text: string): string {
  return text.length > 50_000 ? `${text.slice(0, 50_000)}\n…(truncated)` : text;
}

function caseScopedArtifactUri(caseId: string, uri: string): string | null {
  const prefix = `${caseId}/`;
  return uri.startsWith(prefix) ? uri : null;
}

function resolveJobArtifactUri(
  data: GetArtifactContentInput & { source: "job" },
  context: OrpcFnContext
): Promise<string | null> {
  return orpcFromContext(context)
    .jobs.get({
      caseId: data.caseId,
      jobId: data.jobId,
    })
    .then((job) => {
      const artifact = job.output?.find((row) => row.sha256 === data.sha256);
      if (artifact?.uri === undefined || artifact.uri === "") return null;
      return caseScopedArtifactUri(data.caseId, artifact.uri);
    });
}

function fetchEvidenceBlobText(
  data: GetArtifactContentInput & { source: "evidence" },
  context: OrpcFnContext
): Promise<string | null> {
  return orpcFromContext(context)
    .evidence.downloadUrl({
      caseId: data.caseId,
      evidenceId: data.evidenceId,
    })
    .then(({ url }) => {
      if (url === null || url === "") return null;
      return fetch(url);
    })
    .then((res) => {
      if (res === null || !res.ok) return null;
      return res.arrayBuffer();
    })
    .then((buf) => {
      if (buf === null) return null;
      const bytes = new Uint8Array(buf);
      return truncateArtifactText(new TextDecoder().decode(bytes));
    });
}

/**
 * Fetch artifact content from MinIO for display in the job Detail.
 * Returns text content for JSON/text artifacts, null for binary.
 */
export const getArtifactContentFn = createServerFn({ method: "POST" })
  .validator(getArtifactContentInputSchema)
  .handler(async ({ data, context }): Promise<{ text: string | null }> => {
    if (!isTextMime(data.mime)) return { text: null };

    if (data.source === "evidence") {
      return { text: await fetchEvidenceBlobText(data, context) };
    }

    const uri = await resolveJobArtifactUri(data, context);
    if (uri === null) return { text: null };

    const bytes = await runApp(readArtifactBytesEffect(uri));
    return { text: truncateArtifactText(new TextDecoder().decode(bytes)) };
  });
