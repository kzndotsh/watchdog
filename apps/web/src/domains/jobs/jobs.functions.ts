import { createServerFn } from "@tanstack/react-start";

import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import { orpcFromContext } from "@/lib/orpc.server";
import type {
  JobListRecord,
  JobRecord,
  ProviderCallList,
} from "@watchdog/core/jobs";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";
import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  getJobInputSchema,
  getPlaybookRunInputSchema,
  jobList,
  retryJobInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
} from "@watchdog/schemas/jobs";

export type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";

export const listCapabilitiesFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<CapListItem[]> =>
    await orpcFromContext(context).capabilities.list()
);

export const listPlaybooksFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<PlaybookListItem[]> =>
    await orpcFromContext(context).capabilities.listPlaybooks()
);

/** Rows the Case overview reads: its newest Jobs, one page, for the Recent activity feed. */
const RECENT_JOBS_LIMIT = 50;

/** The Case's most recently updated Jobs, one page (the Case overview's Recent activity). */
export const listRecentJobsFn = createServerFn({ method: "GET" })
  .validator(jobList.input)
  .handler(async ({ data, context }): Promise<JobListRecord[]> => {
    const page = await orpcFromContext(context).jobs.listForCase({
      caseId: data.caseId,
      limit: RECENT_JOBS_LIMIT,
    });
    return page.items;
  });

export const getJobFn = createServerFn({ method: "GET" })
  .validator(getJobInputSchema)
  .handler(
    async ({ data, context }): Promise<JobRecord> =>
      await orpcFromContext(context).jobs.get({
        caseId: data.caseId,
        jobId: data.jobId,
      })
  );

export const listJobProviderCallsFn = createServerFn({ method: "GET" })
  .validator(getJobInputSchema)
  .handler(
    async ({ data, context }): Promise<ProviderCallList> =>
      await orpcFromContext(context).jobs.listProviderCalls({
        caseId: data.caseId,
        jobId: data.jobId,
      })
  );

export const getPlaybookRunFn = createServerFn({ method: "GET" })
  .validator(getPlaybookRunInputSchema)
  .handler(
    async ({ data, context }): Promise<PlaybookRunView> =>
      await orpcFromContext(context).jobs.getPlaybookRun(data)
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

export const retryJobFn = createServerFn({ method: "POST" })
  .validator(retryJobInputSchema)
  .handler(
    async ({ data, context }): Promise<JobRecord> =>
      await orpcFromContext(context).jobs.retry(data)
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
