import { z } from "zod";

import {
  NAME_MAX,
  requiredText,
  trimmedUuidSchema,
} from "@watchdog/schemas/shared";

export const invitationPreviewSchema = z.object({
  id: trimmedUuidSchema,
});

export const inviteSignUpBody = z.object({
  invitationId: trimmedUuidSchema,
  name: requiredText(NAME_MAX),
  password: z.string().min(1),
});
