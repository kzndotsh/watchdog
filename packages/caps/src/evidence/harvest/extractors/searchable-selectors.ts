import type { IdentifierType } from "@watchdog/schemas/shared";

import { pushClaim, pushId } from "../harvest-helpers";
import * as P from "../harvest-patterns";
import type { HarvestCtx, HarvestExtractor } from "./types";

const PLATFORM_BY_BRAND: Record<string, string> = {
  paypal: "paypal",
  venmo: "venmo",
  cashapp: "cashapp",
  "cash app": "cashapp",
  kofi: "kofi",
  "ko-fi": "kofi",
  patreon: "patreon",
};

function paymentPlatform(m: RegExpExecArray): string | undefined {
  const raw = m[0] ?? "";
  const brandMatch = /paypal|venmo|cash\s*app|cashapp|ko-?fi|patreon/i.exec(
    raw
  );
  const brand = (brandMatch?.[0] ?? "").toLowerCase().replaceAll(/\s+/g, " ");
  const platform = PLATFORM_BY_BRAND[brand] ?? brand.replaceAll("-", "");
  return platform === "" ? undefined : platform;
}

type SelectorRule =
  | {
      kind: "id";
      re: RegExp;
      type: IdentifierType;
      notes: string;
      value: (m: RegExpExecArray) => string | null;
      platform?: (m: RegExpExecArray) => string | undefined;
    }
  | {
      kind: "claim";
      re: RegExp;
      text: (m: RegExpExecArray) => string;
    };

const SELECTORS: readonly SelectorRule[] = [
  {
    kind: "id",
    re: P.PAYMENT_HANDLE_RE,
    type: "handle",
    notes: "payment",
    value: (m) => (m[1] ? `@${m[1]}` : null),
    platform: paymentPlatform,
  },
  {
    kind: "id",
    re: P.HAM_CALLSIGN_RE,
    type: "other",
    notes: "ham_callsign",
    value: (m) => (m[1] ? m[1].toUpperCase() : null),
  },
  {
    kind: "id",
    re: P.FAA_N_NUMBER_RE,
    type: "other",
    notes: "faa_n_number",
    value: (m) => (m[1] ? m[1].toUpperCase() : null),
  },
  {
    kind: "claim",
    re: P.PROFESSIONAL_LICENCE_RE,
    text: (m) => `Professional licence phrasing: ${m[0] ?? ""}`,
  },
];

function applySelector(ctx: HarvestCtx, rule: SelectorRule): void {
  rule.re.lastIndex = 0;
  switch (rule.kind) {
    case "id": {
      for (const m of ctx.cleaned.matchAll(rule.re)) {
        const value = rule.value(m);
        if (!value) continue;
        pushId(ctx.identifiers, ctx.seen, rule.type, value, ctx.sourceText, {
          platform: rule.platform?.(m),
          notes: rule.notes,
          quoteNeedle: m[0],
        });
      }
      return;
    }
    case "claim": {
      for (const m of ctx.cleaned.matchAll(rule.re)) {
        const raw = m[0] ?? "";
        pushClaim(ctx.claims, ctx.seen, rule.text(m), ctx.sourceText, raw);
      }
      return;
    }
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

const searchableSelectorsExtractor: HarvestExtractor = {
  id: "searchable_selectors",
  collect(ctx) {
    for (const rule of SELECTORS) applySelector(ctx, rule);
  },
};

export { searchableSelectorsExtractor };
