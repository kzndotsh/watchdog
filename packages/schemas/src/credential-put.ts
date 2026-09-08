import { z } from "zod";

import {
  credentialNameSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
} from "./primitives";

/** Shared fields for credential PUT (web forms + API + CLI). */
export const putCredentialFieldsSchema = z.object({
  name: credentialNameSchema,
  secret: nonEmptyTrimmed,
  label: optionalTrimmedSchema,
});

/** Credential PUT body (same shape as fields). */
export const putCredentialInputSchema = putCredentialFieldsSchema;

/** Credential DELETE body. */
export const deleteCredentialInputSchema = z.object({
  name: credentialNameSchema,
});

export type PutCredentialFields = z.output<typeof putCredentialFieldsSchema>;
export type PutCredentialInput = z.output<typeof putCredentialInputSchema>;
export type DeleteCredentialInput = z.output<
  typeof deleteCredentialInputSchema
>;
