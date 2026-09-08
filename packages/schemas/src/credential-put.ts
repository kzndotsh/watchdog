import { z } from "zod";

import {
  credentialNameSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
} from "./primitives";

/** Shared fields for credential PUT (web forms + API + CLI). */
export const putCredentialInputSchema = z.object({
  name: credentialNameSchema,
  secret: nonEmptyTrimmed,
  label: optionalTrimmedSchema,
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
