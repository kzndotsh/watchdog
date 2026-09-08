import { z } from "zod";

import { nonEmptyTrimmed, trimmedUuidSchema } from "@watchdog/schemas";

export const invitationPreviewSchema = z.object({
  id: trimmedUuidSchema,
});

export const inviteSignUpBody = z.object({
  invitationId: trimmedUuidSchema,
  name: nonEmptyTrimmed,
  password: z.string().min(1),
});
