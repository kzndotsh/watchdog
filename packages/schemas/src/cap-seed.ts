import { z } from "zod";

import { validateIdentifierValue } from "./validate-identifier";

function identifierSeedSchema(type: "domain" | "ip"): z.ZodType<string> {
  return z
    .string()
    .trim()
    .min(1)
    .transform((value, ctx) => {
      const parsed = validateIdentifierValue(type, value);
      if (!parsed.ok) {
        ctx.addIssue({ code: "custom", message: parsed.message });
        return z.NEVER;
      }
      return parsed.value;
    });
}

/** Collect Cap host/domain seed — trim, normalize, reject invalid domains. */
export const hostSeedSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !value.includes("*"), {
    message: "Wildcard domains are not valid host seeds.",
  })
  .transform((value, ctx) => {
    const parsed = validateIdentifierValue("domain", value);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message });
      return z.NEVER;
    }
    return parsed.value;
  });

/** Collect Cap IP seed — trim, normalize, reject invalid addresses. */
export const ipSeedSchema = identifierSeedSchema("ip");
