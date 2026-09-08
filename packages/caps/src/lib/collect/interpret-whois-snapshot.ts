import { randomUUID } from "node:crypto";

import type { CapInterpretResult } from "@watchdog/cap-sdk";
import type { WhoisSnapshot } from "@watchdog/tools";

import {
  interpretIdentifierBatches,
  type IdentifierBatch,
} from "./interpret-identifier-batches";
import {
  resolveCollectEntityId,
  INVALID_COLLECT_ENTITY_SUMMARY,
} from "./resolve-collect-entity-id";

/** Alert when expiry is in the past or within this window. */
const WHOIS_EXPIRY_ALERT_MS = 90 * 24 * 60 * 60 * 1000;

function isWhoisExpirySoon(expiresAt: string, nowMs = Date.now()): boolean {
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return false;
  return ms <= nowMs + WHOIS_EXPIRY_ALERT_MS;
}

function summarizeWhois(label: string, snap: WhoisSnapshot): string {
  const parts: string[] = [`source=${snap.source}`];
  if (snap.registrar) parts.push(`registrar=${snap.registrar}`);
  if (snap.registrantOrg) parts.push(`org=${snap.registrantOrg}`);
  if (snap.nameservers.length) {
    parts.push(`NS=${snap.nameservers.join(",")}`);
  }
  if (snap.registeredAt) parts.push(`registered=${snap.registeredAt}`);
  if (snap.expiresAt) parts.push(`expires=${snap.expiresAt}`);
  return `${label} for ${snap.host}: ${parts.join("; ")}`;
}

/** Shared WHOIS interpret — observation Claim + optional near-expiry Event. */
export function interpretWhoisSnapshot(opts: {
  report: WhoisSnapshot;
  entityId: string | undefined;
  claimLabel: string;
  noEntitySummary: string;
  nowMs?: number;
  extraBatches?: readonly IdentifierBatch[];
}): CapInterpretResult {
  const entityId = resolveCollectEntityId(opts.entityId);
  if (entityId === null) {
    return { patch: [], summary: INVALID_COLLECT_ENTITY_SUMMARY };
  }
  const text = summarizeWhois(opts.claimLabel, opts.report);
  const result = interpretIdentifierBatches({
    entityId,
    batches: opts.extraBatches ?? [],
    claimText: text,
    noEntitySummary: opts.noEntitySummary,
  });
  const expiresAt = opts.report.expiresAt;
  if (
    entityId === undefined ||
    !expiresAt ||
    !isWhoisExpirySoon(expiresAt, opts.nowMs)
  ) {
    return result;
  }
  return {
    ...result,
    patch: [
      ...result.patch,
      {
        op: "create",
        resource: "event",
        id: randomUUID(),
        data: {
          entityId,
          when: expiresAt,
          what: `${opts.claimLabel} expiry for ${opts.report.host}`,
        },
      },
    ],
  };
}
