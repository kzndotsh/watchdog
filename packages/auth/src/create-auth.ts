import { apiKey as apiKeyPlugin } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { admin, organization } from "better-auth/plugins";

import {
  account,
  apiKey as apiKeyTable,
  db,
  invitation,
  member,
  onAuthSessionCreated,
  organization as organizationTable,
  promoteFirstUserToInstanceAdmin,
  session,
  user,
  verification,
} from "@watchdog/db";
import { env } from "@watchdog/env/server";
import {
  asOrganizationId,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import {
  DISABLED_ACCOUNT_MESSAGE,
  instanceAdminAccess,
  isInstanceAdmin,
} from "./instance-admin";
import { inviteSignupPlugin } from "./invite-signup-plugin";
import { sendInvitationEmail } from "./send-invitation-email";

/** Accept both localhost and 127.0.0.1 — browsers treat them as different origins. */
function trustedAuthOrigins(base: string): string[] {
  const origins = new Set<string>([base]);
  try {
    const url = new URL(base);
    const hosts =
      url.hostname === "127.0.0.1" || url.hostname === "localhost"
        ? ["127.0.0.1", "localhost"]
        : [url.hostname];
    // Vite falls back to 3001+ when 3000 is taken — trust common local ports.
    const ports =
      url.hostname === "127.0.0.1" || url.hostname === "localhost"
        ? ["3000", "3001", "3002", "3010", "3300", url.port || "3000"]
        : [url.port];
    for (const host of hosts) {
      for (const port of new Set(ports.filter(Boolean))) {
        origins.add(`${url.protocol}//${host}:${port}`);
      }
    }
  } catch {
    // keep base only
  }
  for (const trimmed of env.BETTER_AUTH_TRUSTED_ORIGINS) {
    if (trimmed) origins.add(trimmed);
  }
  return [...origins];
}

/**
 * The Watchdog Better Auth instance: Drizzle adapter, API keys, one organization,
 * instance admin, invite-only signup.
 *
 * `trailingPlugins` are appended last. Framework cookie plugins (TanStack Start's
 * `tanstackStartCookies()`) must be last, otherwise later plugins' Set-Cookie
 * can be dropped, so the app passes them here instead of this package importing
 * its framework.
 */
export function createAuth<const T extends BetterAuthPlugin[] = []>(
  options: {
    trailingPlugins?: T;
    /**
     * Remove everything an organization owns (Cases and their artifacts) before the
     * organization row goes. Organization deletion is only enabled when this is given,
     * because Cases reference organizations by soft id and would be orphaned otherwise.
     * Throw to abort the deletion. Better Auth's plain organization id is minted
     * here, at the edge, so the hook receives a validated `OrganizationId`.
     */
    beforeDeleteOrganization?: (input: {
      organizationId: OrganizationId;
      actorId: string;
    }) => Promise<void>;
  } = {}
) {
  const authUrl = env.BETTER_AUTH_URL;

  return betterAuth({
    appName: "Watchdog",
    baseURL: authUrl,
    trustedOrigins: trustedAuthOrigins(authUrl),
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user,
        session,
        account,
        verification,
        apikey: apiKeyTable,
        organization: organizationTable,
        member,
        invitation,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Solo bootstrap: set BETTER_AUTH_ALLOW_SIGNUP=1 for first account, then 0.
      disableSignUp: !env.BETTER_AUTH_ALLOW_SIGNUP,
    },
    session: {
      // Disable fresh-session gate (default 24h). Otherwise list-sessions /
      // unlink-account return SESSION_NOT_FRESH after a day of staying logged in.
      freshAge: 0,
    },
    // Better Auth applies this in production only (per IP, in memory). Paths not listed keep
    // its defaults (sign-in and password flows are already throttled).
    rateLimit: {
      customRules: {
        "/sign-up/email": { window: 60 * 60, max: 10 },
        "/organization/create": { window: 60 * 60, max: 5 },
        "/organization/delete": { window: 60 * 60, max: 5 },
        "/organization/update-member-role": { window: 60, max: 10 },
        "/organization/remove-member": { window: 60, max: 20 },
        "/organization/invite-member": { window: 60, max: 20 },
      },
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await promoteFirstUserToInstanceAdmin(db, created.id);
          },
        },
      },
      session: {
        create: {
          after: async (created) => {
            try {
              await onAuthSessionCreated(db, created);
            } catch {
              // Org stamp / auth_event must not fail sign-in.
            }
          },
        },
      },
    },
    plugins: [
      apiKeyPlugin({
        defaultPrefix: "wd_",
        // Keys carry the organization they act in (`metadata.organizationId`);
        // `createApiContext` re-checks the owner's membership on every call.
        enableMetadata: true,
        keyExpiration: {
          // Bound compromise window; agents can request shorter expiry at create time.
          defaultExpiresIn: 60 * 60 * 24 * 90,
        },
        rateLimit: {
          enabled: true,
          timeWindow: 60 * 60 * 1000,
          maxRequests: 2000,
        },
      }),
      organization({
        // Self-serve organizations follow the signup policy: open installs let
        // anyone create one; invite-only installs reserve it for the instance admin.
        allowUserToCreateOrganization: (candidate) =>
          env.BETTER_AUTH_ALLOW_SIGNUP ||
          isInstanceAdmin(
            typeof candidate.role === "string" ? candidate.role : null
          ),
        creatorRole: "owner",
        disableOrganizationDeletion:
          options.beforeDeleteOrganization === undefined,
        organizationHooks: {
          beforeDeleteOrganization: async ({
            organization: doomed,
            user: actor,
          }) => {
            await options.beforeDeleteOrganization?.({
              organizationId: asOrganizationId(doomed.id),
              actorId: actor.id,
            });
          },
        },
        requireEmailVerificationOnInvitation: false,
        sendInvitationEmail,
      }),
      admin({
        ac: instanceAdminAccess.ac,
        roles: instanceAdminAccess.roles,
        defaultBanReason: "disabled",
        bannedUserMessage: DISABLED_ACCOUNT_MESSAGE,
      }),
      inviteSignupPlugin(),
      ...(options.trailingPlugins ?? []),
    ],
  });
}
