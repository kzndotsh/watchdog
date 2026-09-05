const API_KEY_ACTOR_PREFIX = "api-key:";

export interface ActorUser {
  name: string;
  email: string;
}

/** Mask local-part except first character. Display only — not Graph audit. */
export function maskEmailForActor(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = local.slice(0, 1);
  return `${keep}***@${domain}`;
}

function slugActorHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replaceAll(/['’]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function actorHandleFromUser(user: ActorUser): string {
  const fromName = slugActorHandle(user.name);
  if (fromName !== "") return fromName;
  const at = user.email.indexOf("@");
  if (at > 0) return slugActorHandle(user.email.slice(0, at));
  return "";
}

/**
 * Resolve a stored actor id (user id or `api-key:…`) to a UI label.
 * People render as a handle from `auth.user` name (else email local-part).
 * The UI adds an AtSign glyph; do not prefix `@` here.
 * Caps never set this; callers pass the job/evidence/graph-write actor.
 */
export function formatActorLabel(
  actorId: string,
  user?: ActorUser | null,
  storedLabel?: string | null
): string {
  const stored = storedLabel?.trim() ?? "";
  if (stored.startsWith(API_KEY_ACTOR_PREFIX)) return stored;
  if (actorId.startsWith(API_KEY_ACTOR_PREFIX)) return actorId;
  if (user) {
    const handle = actorHandleFromUser(user);
    if (handle !== "") return handle;
  }
  if (stored !== "") return stored;
  return actorId;
}

export function storedApiKeyActorLabel(
  name: string | null | undefined
): string | null {
  const trimmed = name?.trim() ?? "";
  return trimmed.startsWith(API_KEY_ACTOR_PREFIX) ? trimmed : null;
}
