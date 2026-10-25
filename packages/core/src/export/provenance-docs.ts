import { CAPABILITIES } from "@watchdog/caps";
import type { CapProvider } from "@watchdog/caps/sdk";

import {
  BREACH_EVIDENCE_WITHHELD,
  type BreachExportNotes,
} from "./breach-evidence";
import { RAW_BODY_WITHHELD } from "./provider-body-policy";

/** Where an included raw response sits in the archive, relative to the Case folder. */
export function providerResponsePath(callId: string): string {
  return `provider-responses/${callId}.bin`;
}

/**
 * The providers whose Caps made the given calls, once each by name, in name order. A provider
 * that is this server (`tier: "self"`) is left out: no third party's data is in its answers.
 * `unknownCaps` counts the Cap ids no longer in the registry, whose provider cannot be named.
 */
export function providersOf(capabilityIds: Iterable<string>): {
  providers: CapProvider[];
  unknownCaps: number;
} {
  const byName = new Map<string, CapProvider>();
  let unknownCaps = 0;
  const providerById = new Map(
    CAPABILITIES.map((cap) => [cap.id, cap.provider])
  );
  for (const id of new Set(capabilityIds)) {
    const provider = providerById.get(id);
    if (provider === undefined) {
      unknownCaps += 1;
    } else if (provider.tier !== "self") {
      byName.set(provider.name, provider);
    }
  }
  return {
    providers: [...byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
    unknownCaps,
  };
}

/** `ATTRIBUTION.md`: the credit line of every provider whose data is in the Export. */
export function buildAttributionMarkdown(
  caseSlug: string,
  exportedAt: string,
  capabilityIds: Iterable<string>
): string {
  const { providers, unknownCaps } = providersOf(capabilityIds);
  const lines = [
    `# Attribution: ${caseSlug}`,
    "",
    `Exported ${exportedAt}.`,
    "",
    "Some Evidence and notes in this Export come from the third-party providers below. Where a provider's terms ask for a credit line, it is given as written. Terms change: check each provider's own page before you rely on or republish its data.",
    "",
  ];
  if (providers.length === 0) {
    lines.push("No third-party provider data is present in this Export.", "");
  }
  for (const provider of providers) {
    const credit =
      provider.attribution === undefined
        ? "none asked for in the terms recorded for this provider."
        : `${provider.attribution.text} (${provider.attribution.url})`;
    lines.push(
      `## ${provider.name}`,
      "",
      `- Site: ${provider.url}`,
      `- Terms: ${provider.termsUrl}`,
      `- Credit line: ${credit}`,
      ""
    );
  }
  if (unknownCaps > 0) {
    lines.push(
      `${unknownCaps} Cap(s) that made calls behind this Export are no longer in this install, so their providers are not listed here. \`provider-calls.jsonl\` still names each call's Cap.`,
      ""
    );
  }
  return lines.join("\n");
}

/**
 * The README section on breach Evidence: what the Export did with the credential fields of
 * breach Cap files. Empty when the Export has no breach Evidence and no opt-in to explain.
 */
function breachCredentialLines(breach: BreachExportNotes): string[] {
  if (
    !breach.isCredentialsIncluded &&
    breach.redacted === 0 &&
    breach.withheld.length === 0
  ) {
    return [];
  }
  const lines = ["## Breach credentials", ""];
  if (breach.isCredentialsIncluded) {
    lines.push(
      "An owner or admin included breach credentials in this Export: breach Evidence files are written as stored, with any recovered passwords and password hashes the Cap kept.",
      ""
    );
  } else {
    lines.push(
      "Breach Evidence (files written by `breach.*` Caps) is exported with its credential fields cut to attributes: whether a password or hash was present, its kind, its length and a keyed reuse fingerprint. No password or password hash from breach Evidence is in this archive; other Evidence (uploads, notes, other Caps) is exported as it was stored. Equal fingerprints within one instance mean the same value; they cannot be matched against another instance or another provider's hash of the same password.",
      "",
      `${breach.redacted} breach Evidence file(s) were written this way.`,
      ""
    );
  }
  if (breach.withheld.length > 0) {
    lines.push(
      "These breach Evidence files are not in the archive:",
      "",
      ...breach.withheld.map(
        ({ path, reason }) =>
          `- \`${path}\` (\`${reason}\`): ${BREACH_EVIDENCE_WITHHELD[reason]}`
      ),
      ""
    );
  }
  return lines;
}

/** `VERIFY.md`: how to check a stored response against its hash, and what that proves. */
export function buildVerifyMarkdown(
  caseSlug: string,
  breach: BreachExportNotes
): string {
  const reasons = Object.entries(RAW_BODY_WITHHELD).map(
    ([code, text]) => `- \`${code}\`: ${text}`
  );
  return [
    `# Verifying provider responses: ${caseSlug}`,
    "",
    "`provider-calls.jsonl` has one JSON object per line: a request Watchdog made to a provider that backs Evidence in this Export. `evidenceIds` lists the exported Evidence the call backs. URLs are the redacted form Watchdog stored: credential values and secret-named parameters are replaced.",
    "",
    "## Check a response against its hash",
    "",
    "Each line records the response body's SHA-256 and size in `body.sha256` and `body.bytes`. When `rawBody.status` is `included`, the bytes are in `rawBody.path`, relative to this folder. Hash the file and compare:",
    "",
    "```sh",
    "sha256sum provider-responses/<callId>.bin   # macOS: shasum -a 256",
    "```",
    "",
    "The digest must equal `body.sha256`, and the file length must equal `body.bytes`. Watchdog checks both before it puts a body in the archive, and leaves the body out (`unreadable`) when they differ.",
    "",
    "## What a match proves",
    "",
    "A match proves the stored body is unchanged since Watchdog received it: the bytes in this archive are the bytes Watchdog hashed on receipt.",
    "",
    "It does not prove what the provider sent on the wire. Watchdog records what its own HTTP client received. Nothing here is signed by the provider, so the hash cannot show that the provider, or a proxy or cache between it and Watchdog, sent exactly those bytes, or that the provider still serves them. The Evidence is as trustworthy as the provider and the path to it.",
    "",
    "## Bodies that are not in the archive",
    "",
    "A raw response is included only when an owner or admin asked for raw responses in this Export, the provider host's terms are recorded as allowing redistribution, the Cap is not a breach Cap and the response did not come from a host the input named. Otherwise the envelope keeps the hash and size, and `rawBody.status` is `withheld` with one of these reasons:",
    "",
    ...reasons,
    "",
    "A hash with no body proves nothing on its own; it lets you check a copy of the response you obtain lawfully elsewhere.",
    "",
    "## Reading `body.state`",
    "",
    "- `stored`: the whole response was kept.",
    "- `hashed`: the response was hashed and not kept (`body.reason` says why, for example over the keep limit, a fingerprint-only Cap, or served from an in-process cache).",
    "- `partial`: only a prefix was read; the hash is of that prefix.",
    "- `none`: no response body (the call failed first). A DNS call records its parsed answer as canonical JSON, not a raw packet.",
    "",
    "`isServedFromCache` means an in-process cache answered and no request went to the provider. `original` names the call it answered for only when that call belongs to this Case; otherwise it is `null` and nothing about the other call is exported.",
    "",
    "## Gaps",
    "",
    '`jobProvenance: "incomplete"` says calls or outcomes of that Job were lost (the worker died mid-call, or a save failed). Evidence with no line was collected by hand, imported, or recorded before calls were kept.',
    "",
    ...breachCredentialLines(breach),
  ].join("\n");
}
