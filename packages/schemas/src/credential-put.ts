import { z } from "zod";

import { NAME_MAX, SECRET_MAX } from "./limits";
import { credentialNameSchema, optionalText, requiredText } from "./primitives";

/** Shared fields for credential PUT (web forms + API + CLI). */
export const putCredentialInputSchema = z.object({
  name: credentialNameSchema,
  secret: requiredText(SECRET_MAX),
  label: optionalText(NAME_MAX),
});

/** Credential DELETE body. */
export const deleteCredentialInputSchema = z.object({
  name: credentialNameSchema,
});

export type PutCredentialInput = z.output<typeof putCredentialInputSchema>;
export type PutCredentialFields = PutCredentialInput;
export type DeleteCredentialInput = z.output<
  typeof deleteCredentialInputSchema
>;
