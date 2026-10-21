import { APIError } from "better-auth/api";
import { afterEach, describe, expect, it } from "vitest";

import { client, db, invitation, organization, user } from "@watchdog/db";
import type { OrganizationId } from "@watchdog/schemas/shared";
import { asOrganizationId } from "@watchdog/schemas/shared";

import { createAuth } from "../create-auth";

const auth = createAuth({ db });
const PASSWORD = "correct horse battery staple";
const EMAIL_DOMAIN = "invite-signup.test";
const SLUG_PREFIX = "invite-signup-";

const DAY_MS = 24 * 60 * 60 * 1000;

type SeedInvitation = {
  email?: string;
  role?: string;
  status?: string;
  expiresInMs?: number;
};

/** An organization, its inviter, and one invitation row, written directly. */
async function seedInvitation(opts: SeedInvitation = {}) {
  const organizationId: OrganizationId = asOrganizationId(crypto.randomUUID());
  await db.insert(organization).values({
    id: organizationId,
    name: "Invite Org",
    slug: `${SLUG_PREFIX}${organizationId}`,
    createdAt: new Date(),
  });
  const inviterId = crypto.randomUUID();
  await db.insert(user).values({
    id: inviterId,
    email: `inviter-${inviterId}@${EMAIL_DOMAIN}`,
    name: "Inviter",
    emailVerified: true,
  });
  const id = crypto.randomUUID();
  const email = opts.email ?? `Newbie-${id}@${EMAIL_DOMAIN}`;
  await db.insert(invitation).values({
    id,
    organizationId,
    email,
    role: opts.role ?? "member",
    status: opts.status ?? "pending",
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? DAY_MS)),
    createdAt: new Date(),
    inviterId,
  });
  return { id, email, organizationId, inviterId };
}

afterEach(async () => {
  await client`delete from auth."user" where email like ${`%@${EMAIL_DOMAIN}`}`;
  await client`delete from auth.organization where slug like ${`${SLUG_PREFIX}%`}`;
});

function signUp(
  body: { invitationId: string; name?: string; password?: string },
  headers = new Headers()
) {
  return auth.api.inviteSignUp({
    body: { name: "Newbie", password: PASSWORD, ...body },
    headers,
    returnHeaders: true,
  });
}

async function errorCodeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof APIError) {
      const code: unknown = error.body?.code;
      return typeof code === "string" ? code : `NO_CODE:${error.status}`;
    }
    return `THROWN:${error instanceof Error ? error.message : String(error)}`;
  }
  return "SUCCEEDED";
}

async function usersWithEmail(email: string) {
  return client`select id from auth."user" where email = ${email.toLowerCase()}`;
}

async function membersOf(organizationId: string) {
  return client`select user_id, role from auth.member where organization_id = ${organizationId}`;
}

async function statusOf(invitationId: string) {
  const [row] =
    await client`select status from auth.invitation where id = ${invitationId}`;
  return row?.status;
}

describe("invite sign-up", () => {
  it("creates the account, joins the organization with the invited role and signs the user in", async () => {
    const invite = await seedInvitation({ role: "admin" });

    const { headers, response } = await signUp({ invitationId: invite.id });

    expect(response.user.email).toBe(invite.email.toLowerCase());
    const [created] = await usersWithEmail(invite.email);
    expect(created?.id).toBe(response.user.id);
    expect(await membersOf(invite.organizationId)).toEqual([
      { user_id: response.user.id, role: "admin" },
    ]);
    expect(await statusOf(invite.id)).toBe("accepted");

    // The cookies it set are a working session already inside the invited organization.
    const cookie = headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.id).toBe(response.user.id);
    expect(session?.session.activeOrganizationId).toBe(invite.organizationId);
  });

  it("sets a password the new user can sign in with, and names the user as given", async () => {
    const invite = await seedInvitation();
    await signUp({
      invitationId: invite.id,
      name: "Grace Hopper",
      password: "another long passphrase",
    });

    const signedIn = await auth.api.signInEmail({
      body: { email: invite.email, password: "another long passphrase" },
    });
    expect(signedIn.user.name).toBe("Grace Hopper");
    await expect(
      errorCodeOf(async () =>
        auth.api.signInEmail({
          body: { email: invite.email, password: PASSWORD },
        })
      )
    ).resolves.not.toBe("SUCCEEDED");
  });

  it("is single use: a second sign-up with the same invitation is refused", async () => {
    const invite = await seedInvitation();
    await signUp({ invitationId: invite.id });

    const replay = await errorCodeOf(async () =>
      signUp({ invitationId: invite.id, password: "a different passphrase" })
    );

    expect(replay).toBe("INVITATION_NOT_FOUND");
    expect(await membersOf(invite.organizationId)).toHaveLength(1);
  });

  it("refuses an unknown invitation without creating anything", async () => {
    const code = await errorCodeOf(async () =>
      signUp({ invitationId: crypto.randomUUID() })
    );
    expect(code).toBe("INVITATION_NOT_FOUND");
  });

  it("refuses an expired invitation and leaves it pending with no account", async () => {
    const invite = await seedInvitation({ expiresInMs: -1000 });

    expect(
      await errorCodeOf(async () => signUp({ invitationId: invite.id }))
    ).toBe("INVITATION_NOT_FOUND");
    expect(await usersWithEmail(invite.email)).toEqual([]);
    expect(await membersOf(invite.organizationId)).toEqual([]);
  });

  it.each(["canceled", "rejected", "accepted"])(
    "refuses a %s invitation",
    async (status) => {
      const invite = await seedInvitation({ status });

      expect(
        await errorCodeOf(async () => signUp({ invitationId: invite.id }))
      ).toBe("INVITATION_NOT_FOUND");
      expect(await usersWithEmail(invite.email)).toEqual([]);
      expect(await membersOf(invite.organizationId)).toEqual([]);
    }
  );

  it("refuses an email that already has an account, and keeps the invitation usable", async () => {
    const invite = await seedInvitation();
    await db.insert(user).values({
      id: crypto.randomUUID(),
      email: invite.email.toLowerCase(),
      name: "Existing",
      emailVerified: true,
    });

    expect(
      await errorCodeOf(async () => signUp({ invitationId: invite.id }))
    ).toBe("USER_ALREADY_EXISTS");
    expect(await membersOf(invite.organizationId)).toEqual([]);
    expect(await statusOf(invite.id)).toBe("pending");
  });

  it("refuses a password outside the configured length, before creating the account", async () => {
    const invite = await seedInvitation();
    const { minPasswordLength, maxPasswordLength } = (await auth.$context)
      .password.config;

    expect(
      await errorCodeOf(async () =>
        signUp({
          invitationId: invite.id,
          password: "x".repeat(minPasswordLength - 1),
        })
      )
    ).toBe("PASSWORD_TOO_SHORT");
    expect(
      await errorCodeOf(async () =>
        signUp({
          invitationId: invite.id,
          password: "x".repeat(maxPasswordLength + 1),
        })
      )
    ).toBe("PASSWORD_TOO_LONG");
    expect(await usersWithEmail(invite.email)).toEqual([]);
    expect(await statusOf(invite.id)).toBe("pending");
  });

  it("refuses a caller who is already signed in", async () => {
    const first = await seedInvitation();
    const { headers } = await signUp({ invitationId: first.id });
    const cookie = headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    const second = await seedInvitation();

    expect(
      await errorCodeOf(async () =>
        signUp({ invitationId: second.id }, new Headers({ cookie }))
      )
    ).toBe("ALREADY_SIGNED_IN");
    expect(await usersWithEmail(second.email)).toEqual([]);
    expect(await statusOf(second.id)).toBe("pending");
  });

  it("lets only one of two simultaneous sign-ups join the organization", async () => {
    const invite = await seedInvitation();

    const outcomes = await Promise.all([
      errorCodeOf(async () => signUp({ invitationId: invite.id })),
      errorCodeOf(async () =>
        signUp({ invitationId: invite.id, password: "a different passphrase" })
      ),
    ]);

    expect(outcomes.filter((code) => code === "SUCCEEDED")).toHaveLength(1);
    expect(await membersOf(invite.organizationId)).toHaveLength(1);
    expect(await usersWithEmail(invite.email)).toHaveLength(1);
  });
});

describe("invitation preview", () => {
  it("shows a pending invitation's email, role and organization name", async () => {
    const invite = await seedInvitation({ role: "member" });

    const preview = await auth.api.invitationPreview({
      query: { id: invite.id },
    });

    expect(preview).toEqual({
      id: invite.id,
      email: invite.email,
      role: "member",
      organizationName: "Invite Org",
    });
  });

  it("answers an expired, used or unknown invitation alike", async () => {
    const expired = await seedInvitation({ expiresInMs: -1000 });
    const used = await seedInvitation({ status: "accepted" });
    const codes = await Promise.all(
      [expired.id, used.id, crypto.randomUUID()].map(async (id) =>
        errorCodeOf(async () => auth.api.invitationPreview({ query: { id } }))
      )
    );
    expect(codes).toEqual([
      "INVITATION_NOT_FOUND",
      "INVITATION_NOT_FOUND",
      "INVITATION_NOT_FOUND",
    ]);
  });
});
