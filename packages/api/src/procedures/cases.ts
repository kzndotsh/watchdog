import { z } from "zod";

import {
  createCaseEffect,
  deleteCaseEffect,
  getCaseByIdEffect,
  getCaseBySlugEffect,
  getDeletedCaseBySlugEffect,
  getDeletionPolicyEffect,
  listCasesEffect,
  listDeletedCasesEffect,
  purgeCaseEffect,
  restoreCaseEffect,
  updateCaseEffect,
} from "@watchdog/core/cases";
import {
  createCaseInputSchema,
  deleteCaseInputSchema,
  deletionPolicyInputSchema,
  getCaseBySlugInputSchema,
  listDeletedCasesInputSchema,
  updateCaseInputSchema,
  listCasesInputSchema,
} from "@watchdog/schemas/cases";

import { graphActorFromContext } from "../actor-label";
import { authed, sessionAuthed } from "../os";
import { runApp } from "../runtime";
import {
  casePageSchema,
  caseSchema,
  deletedCaseSchema,
  deletedCasesPageSchema,
  deletionPolicySchema,
  restoredCaseSchema,
} from "../schemas";
import { assertSessionCredential } from "../scope";

export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases",
    summary: "List cases",
    tags: ["cases"],
  })
  .input(listCasesInputSchema.optional())
  .output(casePageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listCasesEffect(context.actor.organizationId, {
        cursor: input?.cursor,
        limit: input?.limit,
      })
    )
  );

export const get = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}",
    summary: "Get case by id",
    tags: ["cases"],
  })
  .input(deleteCaseInputSchema)
  .output(caseSchema)
  .handler(async ({ input, context }) =>
    runApp(getCaseByIdEffect(input.caseId, context.actor.organizationId))
  );

export const getBySlug = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/case-slugs/{caseSlug}",
    summary:
      "Get case by slug (what a Case URL names); a slug the organization cannot see is not found",
    tags: ["cases"],
  })
  .input(getCaseBySlugInputSchema)
  .output(caseSchema)
  .handler(async ({ input, context }) =>
    runApp(getCaseBySlugEffect(input.caseSlug, context.actor.organizationId))
  );

export const create = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "POST",
    path: "/cases",
    summary: "Create a case",
    tags: ["cases"],
    successStatus: 201,
  })
  .input(createCaseInputSchema)
  .output(caseSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createCaseEffect({
        ...input,
        organizationId: context.actor.organizationId,
      })
    )
  );

export const update = authed
  .meta({ scope: "graph:write" })
  .route({
    method: "PATCH",
    path: "/cases/{caseId}",
    summary:
      "Update case name (regenerates slug), description, or the egress classes it allows (changing them needs an owner or admin signed in; an API key is refused)",
    tags: ["cases"],
  })
  .input(updateCaseInputSchema)
  .output(caseSchema)
  .handler(async ({ input, context }) => {
    if (input.allowedEgress !== undefined) {
      // The allowed egress is an owner or admin decision (core checks the role), and only a
      // signed-in person makes it: a key sending the field is refused whatever its scopes.
      assertSessionCredential(context.credential);
    }
    return runApp(
      updateCaseEffect({
        id: input.caseId,
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.allowedEgress === undefined
          ? {}
          : { allowedEgress: input.allowedEgress }),
      })
    );
  });

export const remove = sessionAuthed
  .route({
    method: "DELETE",
    path: "/cases/{caseId}",
    summary:
      "Delete a case (owner or admin): it moves to Deleted Cases and can be restored until the retention window ends, then it is purged. Queued and running Jobs are cancelled.",
    tags: ["cases"],
  })
  .input(deleteCaseInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteCaseEffect(input.caseId, {
        ...graphActorFromContext(context),
        organizationId: context.actor.organizationId,
      })
    );
    return { ok: true as const };
  });

export const restore = sessionAuthed
  .route({
    method: "POST",
    path: "/cases/{caseId}/restore",
    summary:
      "Restore a deleted case (owner or admin) before its purge; refused once a purge has begun. If its link was taken meanwhile it gets a new one (previousSlug is set)",
    tags: ["cases"],
  })
  .input(deleteCaseInputSchema)
  .output(restoredCaseSchema)
  .handler(async ({ input, context }) =>
    runApp(
      restoreCaseEffect(input.caseId, {
        ...graphActorFromContext(context),
        organizationId: context.actor.organizationId,
      })
    )
  );

export const purge = sessionAuthed
  .route({
    method: "POST",
    path: "/cases/{caseId}/purge",
    summary:
      "Purge a deleted case now (owner or admin, signed-in session only, never an API key): erases its Graph, history, Evidence and files; only the deletion record remains",
    tags: ["cases"],
  })
  .input(deleteCaseInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      purgeCaseEffect(input.caseId, {
        ...graphActorFromContext(context),
        organizationId: context.actor.organizationId,
      })
    );
    return { ok: true as const };
  });

export const listDeleted = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/deleted-cases",
    summary:
      "List deleted cases (owner or admin), newest deletion first, with who deleted them and how long they can be restored",
    tags: ["cases"],
  })
  .input(listDeletedCasesInputSchema)
  .output(deletedCasesPageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listDeletedCasesEffect({
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        ...input,
      })
    )
  );

export const getDeletedBySlug = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/deleted-case-slugs/{caseSlug}",
    summary:
      "The deleted case a case URL names (owner or admin); anything else is not found, so a deleted case's existence is never confirmed to a member",
    tags: ["cases"],
  })
  .input(getCaseBySlugInputSchema)
  .output(deletedCaseSchema)
  .handler(async ({ input, context }) =>
    runApp(
      getDeletedCaseBySlugEffect({
        slug: input.caseSlug,
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
      })
    )
  );

// Not case data: the instance's restore window, and whether the caller may delete, restore and purge.
export const deletionPolicy = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/case-deletion-policy",
    summary:
      "How long a deleted case stays restorable, and whether the caller may delete, restore and purge cases; with caseId, how many Jobs deleting it would cancel",
    tags: ["cases"],
  })
  .input(deletionPolicyInputSchema)
  .output(deletionPolicySchema)
  .handler(async ({ input, context }) =>
    runApp(
      getDeletionPolicyEffect({
        organizationId: context.actor.organizationId,
        actorId: context.actor.userId,
        ...(input.caseId === undefined ? {} : { caseId: input.caseId }),
      })
    )
  );
