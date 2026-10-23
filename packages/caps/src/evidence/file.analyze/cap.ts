import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/schemas/shared";
import { mapToolsCatch, ValidationVendorError } from "@watchdog/tools/errors";
import { analyzeFileBytes } from "@watchdog/tools/file";

import { localAnalysis } from "../../providers";
import { defineCapability } from "../../sdk";
import {
  interpretProcessDraft,
  uploadProcessArtifacts,
} from "../lib/process-shared";
import { fileAnalyzeInput } from "./input";
import { fileAnalyzeReportSchema } from "./report-schema";
import { fileAnalyzeToDraft } from "./to-draft";

export const fileAnalyze = defineCapability({
  id: "evidence.file.analyze",
  version: "1",
  provider: localAnalysis,
  title: "Analyze file",
  description:
    "Inspect a file held as Evidence: its type, basic metadata, readable text and SHA-256 hash, drafted as findings for Triage.",
  dataSource: "local file bytes",
  input: fileAnalyzeInput,
  timeoutMs: 30_000,
  kind: "process",
  useCases: ["Passive"],
  consumes: [{ kind: "evidence", evidenceKind: "file" }],
  produces: [{ kind: "evidence", evidenceKind: "file" }],
  jobPolicy: {
    needsEvidenceSnapshot: true,
    linkEvidenceFromInput: ["evidenceId"],
    markEvidenceProcessed: true,
  },
  run: (ctx) =>
    Effect.gen(function* fileAnalyzeRun() {
      const snapshot = ctx.evidenceSnapshot;
      if (!snapshot) {
        return yield* new ValidationVendorError({
          message: "EvidenceSnapshot missing — packer did not run",
        });
      }
      const uri = snapshot.uri?.trim() ?? "";
      let bytes: Uint8Array;
      if (uri === "") {
        if (snapshot.text.trim() === "") {
          return yield* new ValidationVendorError({
            message: "File Evidence has no bytes (missing uri and empty text)",
          });
        }
        bytes = new TextEncoder().encode(snapshot.text);
        ctx.log(`analyzing snapshot text (${bytes.byteLength} bytes)`);
      } else {
        bytes = new Uint8Array(yield* ctx.readArtifact(uri));
        ctx.log(`read Evidence bytes (${bytes.byteLength})`);
      }
      const snap = yield* Effect.try({
        try: () => analyzeFileBytes(snapshot.evidenceId, bytes),
        catch: mapToolsCatch,
      });
      const draft = fileAnalyzeToDraft(snap, snapshot.label);
      const reportBody = { ...draft, sha256: snap.sha256 };
      const artifacts = yield* uploadProcessArtifacts(
        ctx.uploadArtifact,
        snapshot,
        reportBody
      );
      return { artifacts };
    }),
  handoff(report): JobHandoff | undefined {
    const parsed = fileAnalyzeReportSchema.safeParse(report);
    if (!parsed.success) return undefined;
    const hash = parsed.data.sha256.trim();
    return hash === "" ? undefined : { hash: [hash] };
  },
  interpret(report, opts) {
    return interpretProcessDraft(report, opts, {
      noEntity:
        "File analyze found signal but no Entity attached — attach Entity and re-run",
      empty: "No analyzable file signal in Evidence",
    });
  },
});
