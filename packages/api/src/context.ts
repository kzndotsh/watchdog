import type { AuditableLogger } from "@watchdog/log";

export type ApiAuthMethod = "session" | "apiKey";

export interface ApiActor {
  userId: string;
  email: string | null;
  name: string | null;
  /** Active Better Auth organization; null if the user has no membership. */
  organizationId: string | null;
}

export interface ApiContext {
  headers: Headers;
  actor: ApiActor | null;
  /** How the caller authenticated — session (Dossier) vs API key (agent ingress). */
  authMethod?: ApiAuthMethod;
  /** Present when Start ALS has bound a request/ServerFn logger. */
  log?: AuditableLogger;
}
