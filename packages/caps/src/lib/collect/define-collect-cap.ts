import { Effect } from "effect";
import type { z } from "zod";

import {
  defineCapability,
  type CapContext,
  type CapInterpretOpts,
  type CapInterpretResult,
  type CapServices,
  type CapabilityDef,
} from "@watchdog/cap-sdk";
import type { JsonValue } from "@watchdog/schemas";
import type { ToolsTag } from "@watchdog/tools";

import { uploadJsonReportPair } from "./upload-json-report-pair";

interface CollectSnap<TSnap> {
  readonly snap: TSnap;
  readonly artifactName: string;
}

type CollectCapDef<TSchema extends z.ZodType, TSnap> = Omit<
  CapabilityDef<TSchema>,
  "run" | "interpret"
> & {
  schema: z.ZodType<TSnap>;
  reportLabel: string;
  fetch: (
    ctx: CapContext<z.infer<TSchema>>
  ) => Effect.Effect<CollectSnap<TSnap>, ToolsTag, CapServices>;
  interpretSnap: (
    snap: TSnap,
    opts: CapInterpretOpts<z.infer<TSchema>>
  ) => CapInterpretResult;
};

/** Collect/act Caps: JSON report pair upload + pure interpret(snap). */
export function defineCollectCap<TSchema extends z.ZodType, TSnap>(
  def: CollectCapDef<TSchema, TSnap>
): CapabilityDef<TSchema> {
  const { schema, reportLabel, fetch, interpretSnap, ...meta } = def;
  return defineCapability({
    ...meta,
    kind: meta.kind ?? "collect",
    run: (ctx) =>
      Effect.gen(function* collectCapRun() {
        const { snap, artifactName } = yield* fetch(ctx);
        const { report, artifact } = yield* uploadJsonReportPair(
          ctx.uploadArtifact,
          snap,
          artifactName
        );
        return { artifacts: [report, artifact] };
      }),
    interpret(report: JsonValue, opts) {
      const parsed = schema.safeParse(report);
      if (!parsed.success) {
        throw new Error(
          `Invalid ${reportLabel} report.json shape: ${parsed.error.message}`
        );
      }
      return interpretSnap(parsed.data, opts);
    },
  });
}
