import { z } from "zod";

export const invitationPreviewQuery = z.object({
  id: z.uuid(),
});

export const inviteSignUpBody = z.object({
  invitationId: z.uuid(),
  name: z.string().trim().min(1),
  password: z.string().min(1),
});
