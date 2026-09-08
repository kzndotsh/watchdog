import { z } from "zod";

import {
  deleteCredentialEffect,
  listCredentialSlotsEffect,
  putCredentialSlotEffect,
} from "@watchdog/core";
import {
  deleteCredentialInputSchema,
  putCredentialFieldsSchema,
} from "@watchdog/schemas";

import { authed } from "../os";
import { runApp } from "../runtime";
import { credentialSlotSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/credentials",
    summary: "List credential slots (never plaintext)",
    tags: ["credentials"],
  })
  .output(z.array(credentialSlotSchema))
  .handler(async ({ context }) =>
    runApp(listCredentialSlotsEffect(context.actor.userId))
  );

export const put = authed
  .route({
    method: "PUT",
    path: "/credentials/{name}",
    summary: "Create or replace a credential secret",
    tags: ["credentials"],
  })
  .input(putCredentialFieldsSchema)
  .output(credentialSlotSchema)
  .handler(async ({ input, context }) =>
    runApp(
      putCredentialSlotEffect({
        userId: context.actor.userId,
        name: input.name,
        secret: input.secret,
        label: input.label,
      })
    )
  );

export const remove = authed
  .route({
    method: "DELETE",
    path: "/credentials/{name}",
    summary: "Delete a credential by name",
    tags: ["credentials"],
  })
  .input(deleteCredentialInputSchema)
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(deleteCredentialEffect(context.actor.userId, input.name));
    return { ok: true as const };
  });
