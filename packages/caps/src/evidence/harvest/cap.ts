import { Effect } from "effect";

import { defineCapability } from "@watchdog/cap-sdk";
import { EVIDENCE_HARVEST_CAPABILITY_ID } from "@watchdog/schemas";
import { ValidationVendorError } from "@watchdog/tools";

import {
  interpretProcessDraft,
  uploadProcessArtifacts,
} from "../lib/process-shared";
import { harvestDeterministic } from "./harvest";
import { evidenceHarvestInput } from "./input";

export const harvest = defineCapability({
  id: EVIDENCE_HARVEST_CAPABILITY_ID,
  version: "1",
  title: "Harvest Evidence",
  description:
    "Deterministic regex harvest of identifiers from Evidence text — fast first pass before or instead of AI extract.",
  dataSource: "deterministic harvest",
  input: evidenceHarvestInput,
  timeoutMs: 30_000,
  kind: "process",
  consumes: [{ kind: "evidence", evidenceKind: "file" }],
  produces: [
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "handle" },
    { kind: "identifier", type: "url" },
    { kind: "identifier", type: "phone" },
  ],
  jobPolicy: {
    needsEvidenceSnapshot: true,
    linkEvidenceFromInput: ["evidenceId"],
    markEvidenceProcessed: true,
  },
  run: (ctx) =>
    Effect.gen(function* harvestRun() {
      const snapshot = ctx.evidenceSnapshot;
      if (!snapshot) {
        return yield* new ValidationVendorError({
          message: "EvidenceSnapshot missing — packer did not run",
        });
      }
      ctx.log(
        `harvest Evidence ${snapshot.evidenceId} (${snapshot.text.length} chars)`
      );

      const draft = harvestDeterministic(snapshot.text);
      const artifacts = yield* uploadProcessArtifacts(
        ctx.uploadArtifact,
        snapshot,
        draft
      );
      ctx.log(
        `harvested ${draft.identifiers.length} id(s), ${draft.claims.length} claim(s)`
      );
      return { artifacts };
    }),
  interpret(report, opts) {
    return interpretProcessDraft(report, opts, {
      noEntity:
        "Harvest found signal but no Entity attached — attach Entity and re-Harvest",
      empty: "No extractable identifiers/claims in Evidence text",
    });
  },
});
