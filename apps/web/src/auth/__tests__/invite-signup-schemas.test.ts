import { describe, expect, it } from "vitest";

import {
  invitationPreviewQuery,
  inviteSignUpBody,
} from "@/auth/invite-signup-schemas";

const INVITATION_ID = "550e8400-e29b-41d4-a716-446655440099";

describe("invite-signup-schemas", () => {
  it("trims padded invitation id on preview query", () => {
    expect(
      invitationPreviewQuery.parse({ id: `  ${INVITATION_ID}  ` }).id
    ).toBe(INVITATION_ID);
  });

  it("trims padded invitation id on sign-up body", () => {
    expect(
      inviteSignUpBody.parse({
        invitationId: `  ${INVITATION_ID}  `,
        name: "Ada",
        password: "correct-horse",
      }).invitationId
    ).toBe(INVITATION_ID);
  });

  it("trims padded display name on sign-up body", () => {
    expect(
      inviteSignUpBody.parse({
        invitationId: INVITATION_ID,
        name: "  Ada Lovelace  ",
        password: "correct-horse",
      }).name
    ).toBe("Ada Lovelace");
  });
});
