import { z } from "zod";

import {
  MAX_UPLOAD_BYTES,
  mimeInputSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
  optionalUuidSchema,
  sha256HexSchema,
  trimmedUuidSchema,
} from "./primitives";

/** Shared upload metadata for presign + confirm (web + API + CLI). */
export const evidenceUploadFieldsSchema = z.object({
  sha256: sha256HexSchema,
  mime: mimeInputSchema,
  byteLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const presignUploadInputSchema = z.object({
  caseId: trimmedUuidSchema,
  ...evidenceUploadFieldsSchema.shape,
  name: optionalTrimmedSchema,
});

export const confirmFileUploadInputSchema = z
  .object({
    caseId: trimmedUuidSchema,
    uri: nonEmptyTrimmed,
    ...evidenceUploadFieldsSchema.shape,
    label: optionalTrimmedSchema,
    entityId: optionalUuidSchema,
  })
  .superRefine((input, ctx) => {
    const base = `${input.caseId}/${input.sha256}`;
    if (input.uri.includes("..")) {
      ctx.addIssue({
        code: "custom",
        message: "uri must not contain .. segments",
        path: ["uri"],
      });
    }
    if (input.uri !== base && !input.uri.startsWith(`${base}/`)) {
      ctx.addIssue({
        code: "custom",
        message: `uri must be ${base} or ${base}/<name>`,
        path: ["uri"],
      });
    }
  });

export type PresignUploadInput = z.output<typeof presignUploadInputSchema>;
export type ConfirmFileUploadInput = z.output<
  typeof confirmFileUploadInputSchema
>;
