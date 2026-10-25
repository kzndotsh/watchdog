import { type AuthView, viewPaths } from "@better-auth-ui/core";

/**
 * Every view `<Auth>` renders. Kept apart from `auth.tsx` so the route's `beforeLoad`, which
 * the signed-in shell bundles, can read the allow-list without pulling in every auth form.
 */
export const AUTH_VIEW_LIST = [
  "signIn",
  "signOut",
  "signUp",
  "forgotPassword",
  "resetPassword",
  "verifyEmail",
] as const satisfies readonly AuthView[];

/**
 * URL segments `<Auth>` can render (only the built-in views shipped here, not every
 * `viewPaths.auth` entry), for route allow-lists. A path outside this set would throw.
 */
export const AUTH_VIEW_PATHS: ReadonlySet<string> = new Set(
  AUTH_VIEW_LIST.flatMap((view) => {
    const segment: string | undefined = viewPaths.auth[view];
    return segment === undefined ? [] : [segment];
  })
);
