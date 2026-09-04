import { Effect } from "effect";

import { defineCapability } from "@watchdog/cap-sdk";
import { analyzeEmlText, ValidationVendorError } from "@watchdog/tools";

import {
  interpretProcessDraft,
  uploadProcessArtifacts,
} from "../lib/process-shared";
import { emlAnalyzeInput } from "./input";
import { emlAnalyzeToDraft } from "./to-draft";

export const emlAnalyze = defineCapability({
  id: "evidence.eml.analyze",
  version: "1",
  title: "Analyze EML",
  description:
    "Parse a held .eml into headers, Received chain, and harvested email/URL identifiers for Inbox review.",
  dataSource: "local EML text",
  input: emlAnalyzeInput,
  timeoutMs: 30_000,
  kind: "process",
  useCases: ["Passive"],
  consumes: [{ kind: "evidence", evidenceKind: "file" }],
  produces: [
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    needsEvidenceSnapshot: true,
    linkEvidenceFromInput: ["evidenceId"],
    markEvidenceProcessed: true,
  },
  run: (ctx) =>
    Effect.gen(function* emlAnalyzeRun() {
      const snapshot = ctx.evidenceSnapshot;
      if (!snapshot) {
        return yield* new ValidationVendorError({
          message: "EvidenceSnapshot missing — packer did not run",
        });
      }
      const uri = snapshot.uri?.trim() ?? "";
      let text = snapshot.text;
      if (uri) {
        const bytes = yield* ctx.readArtifact(uri);
        text = yield* Effect.try({
          try: () => new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          catch: () =>
            new ValidationVendorError({
              message: "EML artifact is not valid UTF-8",
            }),
        });
      }
      if (!text.trim()) {
        return yield* new ValidationVendorError({
          message: "EML Evidence has no readable text",
        });
      }
      ctx.log(`eml analyze (${text.length} chars)`);
      const snap = analyzeEmlText(snapshot.evidenceId, text);
      const draft = emlAnalyzeToDraft(snap);
      const artifacts = yield* uploadProcessArtifacts(
        ctx.uploadArtifact,
        snapshot,
        draft
      );
      return { artifacts };
    }),
  interpret(report, opts) {
    return interpretProcessDraft(report, opts, {
      noEntity:
        "EML analyze found signal but no Entity attached — attach Entity and re-run",
      empty: "No extractable EML headers/identifiers",
    });
  },
});
