import { listView } from "@/shared/lib/list/list-view";
import { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList } from "@watchdog/schemas/graph";
import {
  CONFIDENCE_TIERS,
  EVIDENCE_KINDS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPES,
  LIST_TOTAL_CAP,
  type ConfidenceTier,
  type EvidenceKind,
  type IdentifierStatus,
  type IdentifierType,
  type ListPage,
} from "@watchdog/schemas/shared";

/*
 * In-memory lists for the `/ui` gallery: the real declarations (`identifierList`,
 * `evidenceList`) over fake rows, paged, filtered, searched and sorted here the way the server
 * does, so the toolbar, chips, footer and empty states run against the real machinery. Every
 * name, address and URL is fictional (example.com / example.net, 555 numbers).
 */

/** `full` holds rows, `empty` none: the gallery's switch between "No x yet" and the rest. */
export type DemoScope = { readonly dataset: "full" | "empty" };

const PAGE = 50;
const LATENCY_MS = 350;
const BASE_TIME = Date.UTC(2026, 8, 30, 12, 0, 0);

function demoId(prefix: number, n: number): string {
  return `00000000-0000-4000-8${prefix}00-${n.toString(16).padStart(12, "0")}`;
}

function pick<T>(items: readonly T[], n: number): T {
  const item = items[n % items.length];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

async function wait(): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the timer that fakes server latency
  await new Promise<void>((resolve) => {
    setTimeout(resolve, LATENCY_MS);
  });
}

function searchMatches(
  q: string | undefined,
  fields: readonly string[]
): boolean {
  if (q === undefined) return true;
  const needle = q.trim().toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(needle));
}

/** One page by offset cursor, with the capped total on the first page (as `listPageEffect`). */
function pageOf<T>(
  rows: readonly T[],
  cursor: string | undefined
): ListPage<T> {
  const start = cursor === undefined ? 0 : Number(cursor);
  const items = rows.slice(start, start + PAGE);
  const end = start + items.length;
  return {
    items,
    nextCursor: end < rows.length ? String(end) : null,
    total:
      cursor === undefined
        ? {
            count: Math.min(rows.length, LIST_TOTAL_CAP),
            isCapped: rows.length > LIST_TOTAL_CAP,
          }
        : null,
  };
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export const DEMO_ENTITIES = [
  "Acme Ltd",
  "Northwharf Holdings",
  "Pell Receipts",
  "Marek Ellison",
  "Lena Ashmere",
  "Ashmere Fulfillment",
  "Box 14 Mailroom",
  "Harbor Ledger Co",
].map((name, n) => ({ id: demoId(1, n + 1), name }));

export function demoEntityName(id: string | null): string {
  return DEMO_ENTITIES.find((entity) => entity.id === id)?.name ?? "—";
}

export type DemoIdentifier = {
  readonly id: string;
  readonly value: string;
  readonly type: IdentifierType;
  readonly status: IdentifierStatus;
  readonly confidence: ConfidenceTier;
  readonly platform: string;
  readonly entityId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

const PLATFORMS = ["", "Telegram", "Mastodon", "Forum", "Registrar"] as const;

function identifierValue(type: IdentifierType, n: number): string {
  switch (type) {
    case "email": {
      return `contact${n}@example.com`;
    }
    case "phone": {
      return `+1 555 01${String(n % 100).padStart(2, "0")}`;
    }
    case "domain": {
      return `shop${n}.example.net`;
    }
    case "url": {
      return `https://example.com/p/${n}`;
    }
    case "ip": {
      return `203.0.113.${n % 255}`;
    }
    case "handle": {
      return `@watcher${n}`;
    }
    case "crypto":
    case "pgp":
    case "credential":
    case "other": {
      return `${type}-${n}`;
    }
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

const IDENTIFIERS: readonly DemoIdentifier[] = Array.from(
  { length: 1240 },
  (_, n) => {
    const type = pick(IDENTIFIER_TYPES, n);
    return {
      id: demoId(2, n + 1),
      value: identifierValue(type, n + 1),
      type,
      status: pick(IDENTIFIER_STATUSES, Math.floor(n / 3)),
      confidence: pick(CONFIDENCE_TIERS, Math.floor(n / 7)),
      platform: pick(PLATFORMS, Math.floor(n / 5)),
      entityId: pick(DEMO_ENTITIES, Math.floor(n / 11)).id,
      createdAt: new Date(BASE_TIME - n * 3_600_000).toISOString(),
      updatedAt: new Date(
        BASE_TIME - n * 3_600_000 + (n % 7) * 1_800_000
      ).toISOString(),
    };
  }
);

export const demoIdentifierView = listView(identifierList, {
  domain: "ui-gallery",
  scopeKey: (scope: DemoScope) => [scope.dataset],
  getId: (row: DemoIdentifier) => row.id,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 60_000,
  fetchPage: async ({ scope, params, cursor }) => {
    await wait();
    const rows = scope.dataset === "empty" ? [] : IDENTIFIERS;
    const matched = rows.filter(
      (row) =>
        (params.type === undefined || params.type.includes(row.type)) &&
        (params.status === undefined || params.status.includes(row.status)) &&
        (params.confidence === undefined ||
          params.confidence.includes(row.confidence)) &&
        (params.entityId === undefined || params.entityId === row.entityId) &&
        searchMatches(params.q, [row.value, row.platform])
    );
    const sort = params.sort ?? identifierList.defaultSort;
    const sorted = [...matched].sort((a, b) => {
      const column = sort.split(".")[0];
      const field =
        column === "updated" ? ("updatedAt" as const) : ("createdAt" as const);
      const order =
        column === "value"
          ? compareText(a.value, b.value)
          : compareText(a[field], b[field]);
      return (
        (sort.endsWith(".desc") ? -order : order) || compareText(a.id, b.id)
      );
    });
    return pageOf(sorted, cursor);
  },
});

export type DemoEvidence = {
  readonly id: string;
  readonly label: string;
  readonly kind: EvidenceKind;
  readonly sourceUrl: string;
  readonly capturedAt: string;
  readonly isHidden: boolean;
  readonly isProcessed: boolean;
  readonly entityId: string | null;
};

const EVIDENCE: readonly DemoEvidence[] = Array.from(
  { length: 140 },
  (_, n) => ({
    id: demoId(3, n + 1),
    label: `${pick(["Registrar receipt", "Tracking page", "Forum post", "Mailbox photo", "WHOIS record"] as const, n)} ${n + 1}`,
    kind: pick(EVIDENCE_KINDS, Math.floor(n / 2)),
    sourceUrl: `https://example.com/source/${n + 1}`,
    capturedAt: new Date(BASE_TIME - n * 5_400_000).toISOString(),
    isHidden: n % 13 === 0,
    isProcessed: n % 4 !== 0,
    entityId: n % 5 === 0 ? null : pick(DEMO_ENTITIES, n).id,
  })
);

export const demoEvidenceView = listView(evidenceList, {
  domain: "ui-gallery",
  scopeKey: (scope: DemoScope) => [scope.dataset],
  getId: (row: DemoEvidence) => row.id,
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 60_000,
  fetchPage: async ({ scope, params, cursor }) => {
    await wait();
    const rows = scope.dataset === "empty" ? [] : EVIDENCE;
    const matched = rows.filter(
      (row) =>
        row.isHidden === (params.hidden === true) &&
        (params.unprocessed !== true || !row.isProcessed) &&
        (params.unattached !== true || row.entityId === null) &&
        (params.kind === undefined || params.kind.includes(row.kind)) &&
        (params.entityId === undefined || params.entityId === row.entityId) &&
        searchMatches(params.q, [row.label, row.sourceUrl])
    );
    const sort = params.sort ?? evidenceList.defaultSort;
    const sorted = [...matched].sort((a, b) => {
      const order = sort.startsWith("label")
        ? compareText(a.label, b.label)
        : compareText(a.capturedAt, b.capturedAt);
      return (
        (sort.endsWith(".desc") ? -order : order) || compareText(a.id, b.id)
      );
    });
    return pageOf(sorted, cursor);
  },
});
