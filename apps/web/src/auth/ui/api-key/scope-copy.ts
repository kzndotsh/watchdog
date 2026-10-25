import {
  parseKeyScopes,
  SCOPES,
  type Scope,
  type ScopePresetId,
} from "@watchdog/schemas/shared";

/** What a key scope is called and what it lets the key do, as the create dialog and key list say it. */
export const SCOPE_COPY: Record<Scope, { label: string; description: string }> =
  {
    "cases:read": {
      label: "Read cases",
      description:
        "Read Cases, entities, Evidence, Jobs and the activity stream. Every key has this.",
    },
    "evidence:write": {
      label: "Collect evidence",
      description:
        "Add Evidence to a Case and start, cancel or retry Jobs and Playbooks.",
    },
    "proposals:write": {
      label: "Propose changes",
      description:
        "Create Proposals. A person still accepts or rejects them in Triage.",
    },
    "graph:write": {
      label: "Write the Graph",
      description:
        "Change the Graph directly (lands unverified), create and update Cases, and delete or restore them.",
    },
  };

export const PRESET_COPY: Record<
  ScopePresetId,
  { label: string; description: string }
> = {
  agent: { label: "Agent", description: "Reads and proposes" },
  collector: {
    label: "Collector",
    description: "Reads, proposes and collects evidence",
  },
  full: { label: "Full", description: "Every scope" },
};

/** Shown for a key with no stored scopes or scopes that cannot be read: the API refuses it. */
export const UNREADABLE_SCOPES_LABEL = "Unreadable scopes (key refused)";

export type KeyScopesDisplay =
  | { kind: "scopes"; scopes: Scope[] }
  | { kind: "unreadable" };

/** The scopes a listed key shows: its parsed scopes, or an unreadable marker. */
export function keyScopesDisplay(permissions: unknown): KeyScopesDisplay {
  const parsed = parseKeyScopes(permissions);
  if (!parsed.ok) return { kind: "unreadable" };
  return {
    kind: "scopes",
    scopes: SCOPES.filter((scope) => parsed.scopes.has(scope)),
  };
}
