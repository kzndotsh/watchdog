/** Server entry: everything here touches the database, env or Better Auth's server API. */
export { configuredTrustedOrigins, createAuth } from "./create-auth";
export { resolveActorOrganizationId } from "./actor";
export { actorFromSession, createApiContext } from "./api-context";
export { createScopedApiKey } from "./scoped-api-key";
export type { ScopedApiKeyInput } from "./scoped-api-key";
