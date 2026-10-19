import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { NAME_MAX, URL_MAX } from "./limits";
import {
  MAX_UPLOAD_BYTES,
  mimeInputSchema,
  optionalText,
  requiredText,
  optionalUuidSchema,
  sha256HexSchema,
} from "./primitives";

/** Shared upload metadata for presign + confirm (web + API + CLI). */
export const evidenceUploadFieldsSchema = z.object({
  sha256: sha256HexSchema,
  mime: mimeInputSchema,
  byteLength: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const presignUploadInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  ...evidenceUploadFieldsSchema.shape,
  name: optionalText(NAME_MAX),
});

export const confirmFileUploadInputSchema = z
  .object({
    caseId: trimmedCaseIdSchema,
    uri: requiredText(URL_MAX),
    ...evidenceUploadFieldsSchema.shape,
    label: optionalText(NAME_MAX),
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
