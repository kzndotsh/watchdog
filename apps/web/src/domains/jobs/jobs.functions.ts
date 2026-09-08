import { createServerFn } from "@tanstack/react-start";

import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  getJobInputSchema,
  listJobsInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
  type CapListItem,
  type PlaybookListItem,
} from "@/domains/jobs/types";
import { orpcFromContext } from "@/lib/orpc.server";
import type { JobListRecord, JobRecord } from "@watchdog/core";

export type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
export type { JobListRecord, JobRecord } from "@/domains/jobs/types";

export const listCapabilitiesFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<CapListItem[]> =>
    await orpcFromContext(context).capabilities.list()
);

export const listPlaybooksFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<PlaybookListItem[]> =>
    await orpcFromContext(context).capabilities.listPlaybooks()
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
