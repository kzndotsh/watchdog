import { describe, expect, it } from "vitest";

import { asOrganizationId } from "@watchdog/schemas/shared";

import { actorFromSession } from "../api-context";

describe("actorFromSession", () => {
  it("maps a session user to an ApiActor", () => {
    expect(
      actorFromSession(
        {
          user: { id: "user-1", email: "a@example.com", name: "Analyst" },
        },
        asOrganizationId("org-1")
      )
    ).toEqual({
      userId: "user-1",
      email: "a@example.com",
      name: "Analyst",
      organizationId: "org-1",
    });
  });

  it("keeps a missing email and name as null", () => {
    expect(actorFromSession({ user: { id: "user-1" } }, null)).toEqual({
      userId: "user-1",
      email: null,
      name: null,
      organizationId: null,
    });
  });
});
