import { processExtractDraftSchema, type ProcessExtractDraft } from "#ai";

import { HARVEST_EXTRACTORS } from "./extractors";
import { stripZeroWidth } from "./harvest-helpers";
import { maskQuotedSpans } from "./quote-strip";

/** Deterministic harvest → ProcessExtractDraft (no LLM). */
export function harvestDeterministic(text: string): ProcessExtractDraft {
  const identifiers: ProcessExtractDraft["identifiers"] = [];
  const claims: ProcessExtractDraft["claims"] = [];
  const questions: ProcessExtractDraft["questions"] = [];
  const seen = new Set<string>();
  const stripped = stripZeroWidth(text);
  const { cleaned, quotedAuthor } = maskQuotedSpans(stripped);
  const fediSkip = new Set<string>();

  const ctx = {
    sourceText: text,
    cleaned,
    quotedAuthor,
    identifiers,
    claims,
    questions,
    seen,
    fediSkip,
  };

  for (const ex of HARVEST_EXTRACTORS) {
    ex.collect(ctx);
  }

  const nIds = identifiers.length;
  const nClaims = claims.length;
  return processExtractDraftSchema.parse({
    summary:
      nIds + nClaims + questions.length > 0
        ? `Harvested ${nIds} identifier(s), ${nClaims} claim(s) from Evidence text`
        : undefined,
    identifiers,
    claims,
    questions,
  });
}
