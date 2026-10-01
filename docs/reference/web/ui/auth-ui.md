# UI: auth screens (`apps/web/src/auth/ui`)

Sign-in, sign-up, password reset, account / security settings, and API keys. Server-side identity is in [`@watchdog/auth`](../../../../packages/auth/AGENTS.md); this page is about the screens.

## Where it came from

`auth/ui/` was copied in from the [Better Auth UI](https://better-auth-ui.com/docs/shadcn) shadcn registry (`@better-auth-ui/auth`, `settings`, `api-key`; built on `@better-auth-ui/core` + `@better-auth-ui/react` 1.7). Registry components are source you own: a package bump does not update them, and there is no lock file. Since the copy we have:

- switched imports to `@watchdog/ui` primitives and the app toast,
- branded sign-in / accept-invitation with `AuthProductMark`,
- deleted what this app never renders (additional fields, social providers, linked accounts),
- added `PasswordStrengthMeter` and the `ErrorToaster` presentation routing from the registry.

It is **formatted and linted like the rest of the app**. The type-safety rules (`no-unsafe-*`, type assertions) and `prefer-nullish-coalescing` are on: form values go through `formString`, Better Auth error shapes through `authErrorDetails`, and the API-key components take the app's typed `authClient` instead of casting `useAuth().authClient`. A few type-strictness and style rules are off for this folder only (`oxlint.config.ts`, the `auth/ui` override) because the upstream patterns trip them and their autofixes change behavior; drop entries as files get rewritten. `||` fallbacks were audited rather than converted to `??`: empty strings must fall through (an unnamed API key, an empty IP, a blank name), so display fallbacks use `firstNonEmpty` from `@/lib/utils`, and `??` only where the operand can be nothing but `null` / `undefined`.

## What is ours (not in the registry)

| File | Purpose |
| --- | --- |
| `domains/organization/components/accept-invitation.tsx` | Invitation preview, accept for an existing user, or create an account from the invitation (`invite-signup` endpoint). |
| `domains/organization/components/organization-members.tsx` | Members, invitations, roles for the active organization (Settings → Organization). |
| `domains/settings/components/settings-users.tsx` | Instance admin: enable / disable accounts, revoke sessions. |
| `shared/layout/auth-product-mark.tsx` | WATCHDOG mark over the auth screens. |

The upstream organization / admin plugin screens assume self-serve multi-tenancy (org lists, slug routes, teams, impersonation), so these stay hand-built on the Better Auth client.

## Rules

- Customize through `AuthProvider` config (`emailAndPassword`, `plugins`, `localization`) before editing a component.
- `<Auth>` only renders the views in `AUTH_VIEW_PATHS` (`sign-in`, `sign-up`, `sign-out`, `forgot-password`, `reset-password`, `verify-email`). Route allow-lists must use that set, not all of `viewPaths.auth`, or a path like `/auth/error` throws.
- To take a newer registry version, run `pnpm dlx shadcn@latest add @better-auth-ui/<item> --dry-run` / `--diff` and merge by hand: the CLI targets `src/shared/auth` (from `apps/web/components.json`) and wants `sonner`, so it does not map onto this folder without a dedicated `components.json`.
