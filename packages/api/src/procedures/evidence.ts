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
} from "@watchdog/core";
import {
  attachEvidenceEntityInputSchema,
  confirmFileUploadInputSchema,
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  evidenceScopeInputSchema,
  listEvidenceInputSchema,
  presignUploadInputSchema,
  processEvidenceInputSchema,
} from "@watchdog/schemas";

import { actorLabelFromActor } from "../actor-label";
import { authed } from "../os";
import { runApp } from "../runtime";
import { evidenceSchema, jobSchema, presignedUploadSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/evidence",
    summary: "List evidence for a case",
    tags: ["evidence"],
  })
  .input(listEvidenceInputSchema)
  .output(z.array(evidenceSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listEvidenceForCaseEffect(input.caseId, context.actor.organizationId, {
        unprocessedOnly: input.unprocessedOnly,
        unattachedOnly: input.unattachedOnly,
        hiddenOnly: input.hiddenOnly,
      })
    )
  );

export const createPaste = authed
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
        actorLabel: actorLabelFromActor(context.actor),
      })
    )
  );

export const createUrl = authed
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
        actorLabel: actorLabelFromActor(context.actor),
      })
    )
  );

export const softDelete = authed
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
      })
    );
    return { ok: true as const };
  });

export const restore = authed
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
      })
    );
    return { ok: true as const };
  });

export const attachEntity = authed
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
      })
    )
  );

export const presign = authed
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
      })
    )
  );

export const confirmFile = authed
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
        actorLabelFromActor(context.actor)
      )
    )
  );

export const downloadUrl = authed
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
        actorLabel: actorLabelFromActor(context.actor),
      })
    )
  );

export const enrich = authed
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
        actorLabel: actorLabelFromActor(context.actor),
      })
    )
  );
