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
  .input(
    z.object({
      caseId: z.uuid(),
      unprocessedOnly: z.boolean().optional().default(false),
      unattachedOnly: z.boolean().optional().default(false),
      hiddenOnly: z.boolean().optional().default(false),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      body: z.string().min(1),
      label: z.string().optional(),
      sourceUrl: z.url().optional(),
      entityId: z.uuid().optional(),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      sourceUrl: z.url(),
      label: z.string().optional(),
      notes: z.string().optional(),
      entityId: z.uuid().optional(),
    })
  )
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
  .input(z.object({ caseId: z.uuid(), evidenceId: z.uuid() }))
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
  .input(z.object({ caseId: z.uuid(), evidenceId: z.uuid() }))
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
  .input(
    z.object({
      caseId: z.uuid(),
      evidenceId: z.uuid(),
      entityId: z.uuid().nullable(),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      sha256: z.string().min(1),
      mime: z.string().min(1),
      byteLength: z.number().int().positive(),
      name: z.string().optional(),
    })
  )
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
  .input(
    z.object({
      caseId: z.uuid(),
      uri: z.string().min(1),
      sha256: z.string().min(1),
      mime: z.string().min(1),
      byteLength: z.number().int().positive(),
      label: z.string().optional(),
      entityId: z.uuid().optional(),
    })
  )
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
  .input(z.object({ caseId: z.uuid(), evidenceId: z.uuid() }))
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
  .input(
    z.object({
      caseId: z.uuid(),
      evidenceId: z.uuid(),
      ai: z.boolean().optional().default(false),
    })
  )
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
  .input(z.object({ caseId: z.uuid(), evidenceId: z.uuid() }))
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
