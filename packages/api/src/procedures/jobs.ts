import { z } from "zod";

import {
  cancelJobEffect,
  cancelPlaybookRunEffect,
  getJobForCaseEffect,
  listJobsForCaseEffect,
  runPlaybookEffect,
  startJobEffect,
} from "@watchdog/core";
import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  getJobInputSchema,
  listJobsInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
} from "@watchdog/schemas";

import { actorLabelFromActor } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import { jobListSchema, jobSchema } from "../schemas";

export const listForCase = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/jobs",
    summary: "List jobs for a case",
    tags: ["jobs"],
  })
  .input(listJobsInputSchema)
  .output(z.array(jobListSchema))
  .handler(async ({ input, context }) =>
    runApp(listJobsForCaseEffect(input.caseId, context.actor.organizationId))
  );

export const get = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/jobs/{jobId}",
    summary: "Get a job by id (includes logs)",
    tags: ["jobs"],
  })
  .input(getJobInputSchema)
  .output(jobSchema)
  .handler(async ({ input, context }) =>
    runApp(
      getJobForCaseEffect(
        input.caseId,
        context.actor.organizationId,
        input.jobId
      )
    )
  );

export const start = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/jobs",
    summary: "Start a Cap Job",
    tags: ["jobs"],
    successStatus: 201,
  })
  .input(startJobInputSchema)
  .output(jobSchema)
  .handler(async ({ input, context }) =>
    runApp(
      startJobEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
        capabilityId: input.capabilityId,
        input: input.input,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromActor(context.actor),
      })
    )
  );

export const cancel = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/jobs/{jobId}/cancel",
    summary: "Cancel a queued, running, or blocked Job",
    tags: ["jobs"],
  })
  .input(cancelJobInputSchema)
  .output(jobSchema)
  .handler(async ({ input, context }) =>
    runApp(
      cancelJobEffect(input.caseId, context.actor.organizationId, input.jobId, {
        actorId: context.actor.userId,
      })
    )
  );

export const startPlaybook = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/playbooks/{playbookId}/run",
    summary: "Start a playbook (later steps are created after each success)",
    tags: ["jobs"],
    successStatus: 201,
  })
  .input(startPlaybookInputSchema)
  .output(
    z.object({
      playbookId: z.string(),
      playbookRunId: z.uuid(),
      jobs: z.array(jobSchema),
    })
  )
  .handler(async ({ input, context }) =>
    runApp(
      runPlaybookEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
        playbookId: input.playbookId,
        seed: input.seed,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromActor(context.actor),
      })
    )
  );

export const cancelPlaybook = authed
  .route({
    method: "POST",
    path: "/cases/{caseId}/playbook-runs/{playbookRunId}/cancel",
    summary: "Cancel a playbook run (queued and running members)",
    tags: ["jobs"],
  })
  .input(cancelPlaybookInputSchema)
  .output(
    z.object({
      playbookRunId: z.uuid(),
      cancelledJobIds: z.array(z.uuid()),
    })
  )
  .handler(async ({ input, context }) =>
    runApp(
      cancelPlaybookRunEffect(
        input.caseId,
        context.actor.organizationId,
        input.playbookRunId,
        {
          actorId: context.actor.userId,
        }
      )
    )
  );
