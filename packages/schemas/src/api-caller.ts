import type { OrganizationId } from "./ids";

export type ApiActor = {
  userId: string;
  email: string | null;
  name: string | null;
  /** Active Better Auth organization; null if the user has no membership. */
  organizationId: OrganizationId | null;
};

/**
 * How an authenticated caller proved who they are: a session (Dossier) or an API key (agent
 * ingress). A key carries its own id (Better Auth `apikey.id`), so audit and scopes read it from
 * the type, never from the `api-key:<name>` display label.
 */
export type ApiCredential =
  | { kind: "session" }
  | { kind: "apiKey"; keyId: string };

/**
 * Who is calling and how they authenticated; the logger is added by `@watchdog/api`'s `ApiContext`.
 * An actor always comes with its credential; an anonymous caller has neither.
 */
export type ApiCaller = {
  headers: Headers;
} & (
  | { actor: null; credential?: undefined }
  | { actor: ApiActor; credential: ApiCredential }
);
