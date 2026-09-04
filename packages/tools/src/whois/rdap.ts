import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";

import type { ToolsTag } from "../errors/tagged-errors";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import type { WhoisSnapshot } from "./schema";
import {
  extractVcard,
  readRdapDates,
  readRdapLdhName,
  whoisStatusList,
} from "./shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function fetchRdapWhoisEffect(
  host: string,
  signal: AbortSignal
): Effect.Effect<WhoisSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchRdapWhoisGen() {
    const { body: parsed } = yield* fetchJsonObjectEffect({
      url: `https://rdap.org/domain/${encodeURIComponent(host)}`,
      signal,
      service: "RDAP",
      subject: host,
      init: {
        headers: { Accept: "application/rdap+json, application/json" },
      },
    });
    const raw = parsed;
    const entities = Array.isArray(raw.entities) ? raw.entities : [];
    let registrar: string | null = null;
    let registrantOrg: string | null = null;
    for (const ent of entities) {
      if (!isRecord(ent)) continue;
      const roles = Array.isArray(ent.roles) ? ent.roles.map(String) : [];
      const vcard = Array.isArray(ent.vcardArray) ? ent.vcardArray : null;
      const fn = extractVcard(vcard, "fn");
      const org = extractVcard(vcard, "org");
      if (roles.includes("registrar") && fn !== null && fn !== "")
        registrar = fn;
      if (roles.includes("registrant")) registrantOrg = org ?? fn;
    }
    const nameservers = Array.isArray(raw.nameservers)
      ? raw.nameservers
          .map(readRdapLdhName)
          .filter((x): x is string => Boolean(x))
      : [];
    const status = whoisStatusList(raw.status);
    const { registeredAt, expiresAt } = readRdapDates(raw);
    return {
      host,
      source: "rdap",
      registrar,
      registrantOrg,
      nameservers,
      status,
      registeredAt,
      expiresAt,
      raw,
    };
  });
}
