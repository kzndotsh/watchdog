import type { ProcessExtractDraft } from "@watchdog/ai";
import type { EmlAnalyzeSnapshot } from "@watchdog/tools";

import { validatedIdentifierValue } from "../../lib/collect/validated-identifier-value";

function draftIdentifier(
  type: "email" | "url",
  value: string
): ProcessExtractDraft["identifiers"][number] | null {
  const validated = validatedIdentifierValue(type, value);
  if (validated === null) return null;
  return { type, value: validated };
}

export function emlAnalyzeToDraft(
  snap: EmlAnalyzeSnapshot
): ProcessExtractDraft {
  const identifiers: ProcessExtractDraft["identifiers"] = [
    ...snap.emails.flatMap((value) => {
      const row = draftIdentifier("email", value);
      return row === null ? [] : [row];
    }),
    ...snap.urls.flatMap((value) => {
      const row = draftIdentifier("url", value);
      return row === null ? [] : [row];
    }),
  ];
  const claims: ProcessExtractDraft["claims"] = [
    {
      text: `EML From=${snap.from ?? "?"} Subject=${snap.subject ?? "?"} Message-Id=${snap.messageId ?? "?"}`,
    },
  ];
  if (snap.receivedChain.length) {
    claims.push({
      text: `Received chain (${snap.receivedChain.length} hop(s)): ${snap.receivedChain[0]?.slice(0, 200) ?? ""}`,
    });
  }
  return {
    summary: `Analyzed EML (${identifiers.length} identifier(s))`,
    identifiers,
    claims,
    questions: [],
  };
}
