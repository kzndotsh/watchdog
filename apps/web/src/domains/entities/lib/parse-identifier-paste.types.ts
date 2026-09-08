import {
  CONFIDENCE_TIER_LABELS,
  CONFIDENCE_TIERS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPE_LABELS,
  IDENTIFIER_TYPES,
  type ConfidenceTier,
  type IdentifierStatus,
  type IdentifierType,
} from "@watchdog/schemas";

export const PASTE_ROW_CAP = 200;

export const IDENTIFIER_PASTE_TARGETS = [
  "skip",
  "entity",
  "value",
  ...IDENTIFIER_TYPES,
  "type",
  "platform",
  "status",
  "confidence",
] as const;

export type IdentifierPasteTarget = (typeof IDENTIFIER_PASTE_TARGETS)[number];

export const IDENTIFIER_PASTE_TARGET_LABELS: Record<
  IdentifierPasteTarget,
  string
> = {
  skip: "Skip",
  entity: "Entity",
  value: "Value (infer type)",
  ...IDENTIFIER_TYPE_LABELS,
  type: "Type",
  platform: "Platform",
  status: "Status",
  confidence: "Confidence",
};

export type PasteDelimiter = "tab" | "comma" | "semicolon" | "pipe" | "none";

export interface IdentifierPasteEntity {
  id: string;
  name: string;
  slug: string;
}

export interface IdentifierPasteDefaults {
  entityId: string;
  type: IdentifierType | null;
  platform: string;
}

export interface IdentifierPasteRow {
  sourceIndex: number;
  columnIndex: number;
  sourceLine: string;
  entityId: string | null;
  entityName: string | null;
  entityError: string | null;
  type: IdentifierType | null;
  value: string;
  platform: string;
  status: IdentifierStatus;
  confidence: ConfidenceTier;
  error: string | null;
  note: string | null;
}

export interface IdentifierPasteRowOverride {
  entityId?: string;
  type?: IdentifierType | null;
  value?: string;
  platform?: string;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
}

export interface IdentifierPasteTable {
  delimiter: PasteDelimiter;
  hasHeader: boolean;
  headerLine: string | null;
  columnLabels: string[];
  suggestedMapping: IdentifierPasteTarget[];
  suggestedPlatforms: (string | null)[];
  dataLines: string[];
  cells: string[][];
  truncated: boolean;
  rawDataCount: number;
}

export const FIELD_ALIASES: Record<string, IdentifierPasteTarget> = {
  value: "value",
  identifier: "value",
  type: "type",
  platform: "platform",
  entity: "entity",
  name: "entity",
  fullname: "entity",
  displayname: "entity",
  status: "status",
  confidence: "confidence",
};

export const TYPE_HEADER_ALIASES: Record<string, IdentifierType> = {
  username: "handle",
  user: "handle",
  account: "handle",
  aka: "handle",
  alias: "handle",
  mobile: "phone",
  tel: "phone",
  telephone: "phone",
  cell: "phone",
  phonenumber: "phone",
  phoneno: "phone",
  phonenum: "phone",
  emailaddress: "email",
  emailaddr: "email",
  mail: "email",
  website: "url",
  link: "url",
  href: "url",
  webpage: "url",
  host: "domain",
  hostname: "domain",
  fqdn: "domain",
  ipv4: "ip",
  ipv6: "ip",
  wallet: "crypto",
  fingerprint: "pgp",
  login: "credential",
  ...Object.fromEntries([
    [
      [["pass", "word"].join(""), "credential"] satisfies [
        string,
        IdentifierType,
      ],
    ],
  ]),
};

export const UNIQUE_TARGETS = new Set<IdentifierPasteTarget>([
  "entity",
  "type",
  "platform",
  "status",
  "confidence",
  "value",
]);

function buildTokenMap<T extends string>(
  slugs: readonly T[],
  labels: Record<T, string>
): Map<string, T> {
  const map = new Map<string, T>();
  for (const slug of slugs) {
    map.set(slug, slug);
    map.set(labels[slug].toLowerCase(), slug);
  }
  return map;
}

export const TYPE_BY_TOKEN = buildTokenMap(
  IDENTIFIER_TYPES,
  IDENTIFIER_TYPE_LABELS
);
const STATUS_BY_TOKEN = buildTokenMap(
  IDENTIFIER_STATUSES,
  IDENTIFIER_STATUS_LABELS
);
const CONFIDENCE_BY_TOKEN = buildTokenMap(
  CONFIDENCE_TIERS,
  CONFIDENCE_TIER_LABELS
);

export function parsePasteTypeToken(raw: string): IdentifierType | null {
  return TYPE_BY_TOKEN.get(raw.trim().toLowerCase()) ?? null;
}

export function parsePasteStatusToken(raw: string): IdentifierStatus | null {
  return STATUS_BY_TOKEN.get(raw.trim().toLowerCase()) ?? null;
}

export function parsePasteConfidenceToken(raw: string): ConfidenceTier | null {
  return CONFIDENCE_BY_TOKEN.get(raw.trim().toLowerCase()) ?? null;
}
