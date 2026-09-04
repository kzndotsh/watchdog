import { Effect } from "effect";

import type { ToolsTag } from "../errors/tagged-errors";
import { dnsOrEmpty, runAbortableResolver } from "./abortable-resolver";
import {
  txtInventorySnapshotSchema,
  type TxtInventorySnapshot,
  type TxtToken,
} from "./txt-inventory-schema";

export {
  txtInventorySnapshotSchema,
  type TxtInventorySnapshot,
  type TxtToken,
} from "./txt-inventory-schema";

/** Prefix → SaaS product hints (extend on bump — not exhaustive). */
const TXT_SAAS_PREFIXES: readonly {
  prefix: string;
  service: string;
  product: string;
}[] = [
  {
    prefix: "google-site-verification=",
    service: "google_search_console",
    product: "Google Search Console",
  },
  {
    prefix: "google-site-verification:",
    service: "google_search_console",
    product: "Google Search Console",
  },
  {
    prefix: "MS=",
    service: "microsoft_365",
    product: "Microsoft 365",
  },
  {
    prefix: "apple-domain-verification=",
    service: "apple",
    product: "Apple",
  },
  {
    prefix: "atlassian-domain-verification=",
    service: "atlassian",
    product: "Atlassian",
  },
  {
    prefix: "facebook-domain-verification=",
    service: "facebook",
    product: "Facebook",
  },
  {
    prefix: "docusign=",
    service: "docusign",
    product: "DocuSign",
  },
  {
    prefix: "stripe-verification=",
    service: "stripe",
    product: "Stripe",
  },
  {
    prefix: "adobe-idp-site-verification=",
    service: "adobe",
    product: "Adobe",
  },
  {
    prefix: "miro-verification=",
    service: "miro",
    product: "Miro",
  },
  {
    prefix: "zoom-domain-verification=",
    service: "zoom",
    product: "Zoom",
  },
  {
    prefix: "github-verification=",
    service: "github",
    product: "GitHub",
  },
  {
    prefix: "openai-domain-verification=",
    service: "openai",
    product: "OpenAI",
  },
  {
    prefix: "cursor-domain-verification-code=",
    service: "cursor",
    product: "Cursor",
  },
  {
    prefix: "mongodb-site-verification=",
    service: "mongodb",
    product: "MongoDB",
  },
  {
    prefix: "notion-domain-verification=",
    service: "notion",
    product: "Notion",
  },
  {
    prefix: "1password-site-verification=",
    service: "1password",
    product: "1Password",
  },
  {
    prefix: "webexdomainverification=",
    service: "webex",
    product: "Webex",
  },
  {
    prefix: "amazonses:",
    service: "amazon_ses",
    product: "Amazon SES",
  },
];

function flattenTxt(chunks: string[][]): string[] {
  return chunks.map((parts) => parts.join(""));
}

function classifyRecord(record: string): TxtToken {
  const lowered = record.toLowerCase();
  if (lowered.startsWith("v=spf1")) {
    return { record, kind: "spf", service: "spf", product: "SPF" };
  }
  if (lowered.includes("v=dmarc1")) {
    return { record, kind: "dmarc", service: "dmarc", product: "DMARC" };
  }
  if (lowered.includes("v=dkim1")) {
    return { record, kind: "dkim", service: "dkim", product: "DKIM" };
  }

  for (const entry of TXT_SAAS_PREFIXES) {
    if (
      record.startsWith(entry.prefix) ||
      lowered.startsWith(entry.prefix.toLowerCase())
    ) {
      return {
        record,
        kind: "verification",
        service: entry.service,
        product: entry.product,
      };
    }
  }

  return { record, kind: "other", service: null, product: null };
}

/** Exported for unit tests — same classifier used by fetchTxtInventory. */
export function classifyTxtRecord(record: string): TxtToken {
  return classifyRecord(record);
}

/**
 * Resolve apex TXT and classify verification / mail posture tokens.
 * Passive — system resolver only.
 */
export function fetchTxtInventoryEffect(
  host: string,
  signal: AbortSignal
): Effect.Effect<TxtInventorySnapshot, ToolsTag> {
  return runAbortableResolver(signal, "TXT inventory aborted", (resolver) =>
    Effect.gen(function* fetchTxtInventoryGen() {
      const chunks = yield* dnsOrEmpty(
        () => resolver.resolveTxt(host),
        [] as string[][]
      );
      const records = flattenTxt(chunks);
      const tokens = records.map(classifyRecord);
      return txtInventorySnapshotSchema.parse({
        host,
        queriedAt: new Date().toISOString(),
        records,
        tokens,
      });
    })
  );
}
