import {
  defineJsonProvider,
  type JsonProviderContext,
} from "../http/define-json-provider";
import { isRecord } from "../parse/coerce";
import { whoisSnapshotSchema } from "./schema";
import {
  extractVcard,
  normalizeWhoisHost,
  readRdapDates,
  readRdapLdhName,
  whoisStatusList,
} from "./shared";

type RdapOptions = { userAgent: string };

function rdapSnapshot({
  subject: host,
  body: raw,
}: JsonProviderContext<string, RdapOptions>) {
  const entities = Array.isArray(raw.entities) ? raw.entities : [];
  let registrar: string | null = null;
  let registrantOrg: string | null = null;
  for (const ent of entities) {
    if (!isRecord(ent)) continue;
    const roles = Array.isArray(ent.roles) ? ent.roles.map(String) : [];
    const vcard = Array.isArray(ent.vcardArray) ? ent.vcardArray : null;
    const fn = extractVcard(vcard, "fn");
    const org = extractVcard(vcard, "org");
    if (roles.includes("registrar") && fn !== null && fn !== "") registrar = fn;
    if (roles.includes("registrant")) registrantOrg = org ?? fn;
  }
  const nameservers = Array.isArray(raw.nameservers)
    ? raw.nameservers
        .map(readRdapLdhName)
        .filter((x): x is string => Boolean(x))
    : [];
  const { registeredAt, expiresAt } = readRdapDates(raw);
  return {
    host,
    source: "rdap" as const,
    registrar,
    registrantOrg,
    nameservers,
    status: whoisStatusList(raw.status),
    registeredAt,
    expiresAt,
    raw,
  };
}

export const fetchRdapWhoisEffect = defineJsonProvider({
  service: "RDAP",
  schema: whoisSnapshotSchema,
  normalize: normalizeWhoisHost,
  request: (host, _options: RdapOptions) => ({
    url: `https://rdap.org/domain/${encodeURIComponent(host)}`,
    headers: { Accept: "application/rdap+json, application/json" },
  }),
  toSnapshot: rdapSnapshot,
});
