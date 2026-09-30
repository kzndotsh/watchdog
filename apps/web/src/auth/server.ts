import "@tanstack/react-start/server-only";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { createAuth } from "@watchdog/auth/server";

export { resolveActorOrganizationId } from "@watchdog/auth/server";

// tanstackStartCookies() must stay last so later plugins' Set-Cookie isn't dropped.
export const auth = createAuth({ trailingPlugins: [tanstackStartCookies()] });

export type Session = typeof auth.$Infer.Session;
