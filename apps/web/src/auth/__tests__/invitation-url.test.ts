import { describe, expect, it } from "vitest";

import {
  buildInvitationAcceptUrl,
  invitationAcceptPath,
} from "@/auth/invitation-url";

describe("invitation URL", () => {
  it("embeds the invitation id in the accept path", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(invitationAcceptPath(id)).toBe(`/auth/accept-invitation/${id}`);
    expect(buildInvitationAcceptUrl("http://127.0.0.1:3000/", id)).toBe(
      `http://127.0.0.1:3000/auth/accept-invitation/${id}`
    );
  });
});
