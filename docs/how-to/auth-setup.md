# Auth setup

**What this is:** Better Auth layers, session cache, API keys, CSRF, ServerFn vs route auth.  
**What this is not:** product IA for sign-in screens ([`../explanation/ux.md`](../explanation/ux.md)).

## Gotchas

- **Auth session cache**: `_protected` seeds BA UI’s `authQueryKeys.session` via `ensureAppSession` (`createIsomorphicFn`). Use `useSession(authClient)` from `@better-auth-ui/react` in UI — not `authClient.useSession()`. Post-sign-in return URL search param is **`redirectTo`** (BA UI), not `redirect`. Sign out via `/auth/sign-out` (BA UI clears cookie **and** removes auth queries); raw `authClient.signOut()` leaves a stale session cache and bounces you back in.
- **ServerFn auth ≠ route auth**: `_protected` redirects for UX; domain ServerFns are gated by global `requireAuth` in `src/start.ts` (`UnauthorizedError`). Do not re-add `.middleware([requireAuth])` on `*.functions.ts`. No public ServerFn — use `routes/api/*`. Detect denials with `isUnauthorizedError`, not `message === "Unauthorized"`.
- **CSRF on ServerFns**: custom `start.ts` disables Start’s auto CSRF; keep CSRF **after** evlog in `requestMiddleware`. CSRF 403s on `/_serverFn` log `auth.reason: "csrf"` (request logger otherwise skips ServerFns).
