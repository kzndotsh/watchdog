import type { ProcessExtractDraft } from "@watchdog/ai";

import type { DraftClaim, DraftId } from "../harvest-helpers";

export type HarvestCtx = {
  sourceText: string;
  cleaned: string;
  quotedAuthor: string | null;
  identifiers: DraftId[];
  claims: DraftClaim[];
  questions: ProcessExtractDraft["questions"];
  seen: Set<string>;
  fediSkip: Set<string>;
};

export type HarvestExtractor = {
  id: string;
  collect: (ctx: HarvestCtx) => void;
};
