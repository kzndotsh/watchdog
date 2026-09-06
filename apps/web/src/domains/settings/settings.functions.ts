import { createServerFn } from "@tanstack/react-start";

import {
  deleteCredentialInputSchema,
  putCredentialInputSchema,
  type CredentialSlot,
} from "@/domains/settings/types";
import { orpcFromContext } from "@/lib/orpc.server";

export { type CredentialSlot } from "@/domains/settings/types";

export const listCredentialsFn = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<CredentialSlot[]> =>
    orpcFromContext(context).credentials.list()
);

export const putCredentialFn = createServerFn({ method: "POST" })
  .validator(putCredentialInputSchema)
  .handler(async ({ data, context }): Promise<CredentialSlot> =>
    orpcFromContext(context).credentials.put({
      name: data.name,
      secret: data.secret,
      label: data.label,
    })
  );

export const deleteCredentialFn = createServerFn({ method: "POST" })
  .validator(deleteCredentialInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await orpcFromContext(context).credentials.delete({ name: data.name });
    return { ok: true };
  });
