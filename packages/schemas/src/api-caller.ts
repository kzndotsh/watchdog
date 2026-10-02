export type ApiAuthMethod = "session" | "apiKey";

export interface ApiActor {
  userId: string;
  email: string | null;
  name: string | null;
  /** Active Better Auth organization; null if the user has no membership. */
  organizationId: string | null;
}

/** Who is calling and how they authenticated; the logger is added by `@watchdog/api`'s `ApiContext`. */
export interface ApiCaller {
  headers: Headers;
  actor: ApiActor | null;
  /** How the caller authenticated — session (Dossier) vs API key (agent ingress). */
  authMethod?: ApiAuthMethod;
}
