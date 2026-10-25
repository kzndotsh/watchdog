import { z } from "zod";

import {
  attachEvidenceEntityEffect,
  confirmFileUploadEffect,
  dumpPasteEffect,
  dumpUrlEffect,
  enrichUrlEvidenceEffect,
  getEvidenceDownloadUrlEffect,
  listEvidenceForCaseEffect,
  presignUploadEffect,
  processEvidenceEffect,
  restoreEvidenceEffect,
  softDeleteEvidenceEffect,
} from "@watchdog/core/evidence";
import { listEvidenceProviderCallsEffect } from "@watchdog/core/jobs";
import {
  attachEvidenceEntityInputSchema,
  confirmFileUploadInputSchema,
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  listEvidenceInputSchema,
  presignUploadInputSchema,
  processEvidenceInputSchema,
} from "@watchdog/schemas/evidence";
import { evidenceScopeInputSchema } from "@watchdog/schemas/graph";

import { actorKeyIdFromContext, actorLabelFromContext } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import {
  evidenceSchema,
  jobSchema,
  presignedUploadSchema,
  evidencePageSchema,
  providerCallListSchema,
} from "../schemas";

export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/evidence",
    summary: "List evidence for a case",
    tags: ["evidence"],
  })
  .input(listEvidenceInputSchema)
  .output(evidencePageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listEvidenceForCaseEffect(input.caseId, context.actor.organizationId, {
        unprocessedOnly: input.unprocessedOnly,
        unattachedOnly: input.unattachedOnly,
        hiddenOnly: input.hiddenOnly,
        cursor: input.cursor,
        limit: input.limit,
      })
    )
  );

export const listProviderCalls = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/evidence/{evidenceId}/provider-calls",
    summary:
      "List the provider calls behind an Evidence item, with whether the record is complete",
    tags: ["evidence"],
  })
  .input(evidenceScopeInputSchema)
  .output(providerCallListSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listEvidenceProviderCallsEffect(
        input.caseId,
        context.actor.organizationId,
        input.evidenceId
      )
    )
  );

export const createPaste = authed
  .meta({ scope: "evidence:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/evidence/paste",
    summary: "Dump paste text as evidence",
    tags: ["evidence"],
    successStatus: 201,
  })
  .input(dumpPasteInputSchema)
  .output(evidenceSchema)
  .handler(async ({ input, context }) =>
    runApp(
      dumpPasteEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromContext(context),
      })
    )
  );

export const createUrl = authed
  .meta({ scope: "evidence:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/evidence/url",
    summary: "Dump a URL reference as evidence",
    tags: ["evidence"],
    successStatus: 201,
  })
  .input(dumpUrlInputSchema)
  .output(evidenceSchema)
  .handler(async ({ input, context }) =>
    runApp(
      dumpUrlEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromContext(context),
      })
    )
  );

export const softDelete = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/evidence/{evidenceId}",
    summary: "Soft-delete evidence",
    tags: ["evidence"],
  })
  .input(evidenceScopeInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      softDeleteEvidenceEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromContext(context),
      })
    );
    return { ok: true as const };
  });

export const restore = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/evidence/{evidenceId}/restore",
    summary: "Restore soft-deleted evidence to the active queue",
    tags: ["evidence"],
  })
  .input(evidenceScopeInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      restoreEvidenceEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromContext(context),
      })
    );
    return { ok: true as const };
  });

export const attachEntity = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/evidence/{evidenceId}",
    summary: "Attach or replace the Evidence Entity",
    tags: ["evidence"],
  })
  .input(attachEvidenceEntityInputSchema)
  .output(evidenceSchema)
  .handler(async ({ input, context }) =>
    runApp(
      attachEvidenceEntityEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromContext(context),
      })
    )
  );

export const presign = authed
  .meta({ scope: "evidence:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/evidence/presign",
    summary: "Presign a direct upload to object storage",
    tags: ["evidence"],
  })
  .input(presignUploadInputSchema)
  .output(presignedUploadSchema)
  .handler(async ({ input, context }) =>
    runApp(
      presignUploadEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
      })
    )
  );

export const confirmFile = authed
  .meta({ scope: "evidence:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/evidence/file",
    summary: "Confirm a presigned file upload as evidence",
    tags: ["evidence"],
    successStatus: 201,
  })
  .input(confirmFileUploadInputSchema)
  .output(evidenceSchema)
  .handler(async ({ input, context }) =>
    runApp(
      confirmFileUploadEffect(
        {
          ...input,
          organizationId: context.actor.organizationId,
        },
        context.actor.userId,
        actorLabelFromContext(context)
      )
    )
  );

export const downloadUrl = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/evidence/{evidenceId}/download-url",
    summary: "Get a short-lived download URL for evidence",
    tags: ["evidence"],
  })
  .input(evidenceScopeInputSchema)
  .output(z.object({ url: z.string().nullable() }))
  .handler(async ({ input, context }) =>
    runApp(
      getEvidenceDownloadUrlEffect(
        input.caseId,
        context.actor.organizationId,
        input.evidenceId
      )
    )
  );

export const process = authed
  .meta({ scope: "evidence:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/evidence/{evidenceId}/process",
    summary: "Start Harvest or Extract (AI) for evidence",
    tags: ["evidence"],
    successStatus: 201,
  })
  .input(processEvidenceInputSchema)
  .output(jobSchema)
  .handler(async ({ input, context }) =>
    runApp(
      processEvidenceEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromContext(context),
        actorKeyId: actorKeyIdFromContext(context),
      })
    )
  );

export const enrich = authed
  .meta({ scope: "evidence:write" })
  .route({
    method: "POST",
    path: "/cases/{caseId}/evidence/{evidenceId}/enrich",
    summary: "Start URL Enrich for evidence",
    tags: ["evidence"],
    successStatus: 201,
  })
  .input(evidenceScopeInputSchema)
  .output(jobSchema)
  .handler(async ({ input, context }) =>
    runApp(
      enrichUrlEvidenceEffect({
        ...input,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        actorLabel: actorLabelFromContext(context),
        actorKeyId: actorKeyIdFromContext(context),
      })
    )
  );
