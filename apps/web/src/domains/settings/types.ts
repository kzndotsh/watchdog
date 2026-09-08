import type { z } from "zod";

import {
  deleteCredentialInputSchema,
  putCredentialInputSchema,
} from "@watchdog/schemas";

export type { CredentialSlot } from "@watchdog/core";

export { putCredentialInputSchema };
export type PutCredentialInput = z.output<typeof putCredentialInputSchema>;

export { deleteCredentialInputSchema };
export type DeleteCredentialInput = z.output<
  typeof deleteCredentialInputSchema
>;
