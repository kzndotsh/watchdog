import { createIsomorphicFn } from "@tanstack/react-start";

/**
 * Whether public email sign-up is open.
 * Must stay a plain function returning `createIsomorphicFn()…()` so
 * `@watchdog/env/server` stays off the client bundle.
 */
// oxlint-disable-next-line typescript/promise-function-async -- isomorphic fn factory must not be async
export function getAllowSignup() {
  return createIsomorphicFn()
    .server(async () => {
      const { env } = await import("@watchdog/env/server");
      return env.BETTER_AUTH_ALLOW_SIGNUP;
    })
    .client(async () => {
      const response = await fetch("/api/signup-allowed");
      if (!response.ok) return false;
      const body: unknown = await response.json();
      return (
        typeof body === "object" &&
        body !== null &&
        "allowSignup" in body &&
        body.allowSignup === true
      );
    })();
}
