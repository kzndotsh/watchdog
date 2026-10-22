import { Effect } from "effect";
import type { z } from "zod";

import type { JsonValue } from "@watchdog/schemas/shared";
import { watchdogUserAgent, type ToolsTag } from "@watchdog/tools/errors";

import {
  defineCapability,
  type CapContext,
  type CapInterpretOpts,
  type CapInterpretResult,
  type CapServices,
  type CapabilityDef,
} from "../../sdk";
import { uploadJsonReportPair } from "./upload-json-report-pair";

type CollectSnap<TSnap> = {
  readonly snap: TSnap;
  readonly artifactName: string;
};

/** Derived per Cap by `defineCollectCap`; a Cap never spells its own. */
export type CollectFetchEnv = {
  /** `watchdogUserAgent(id)`: the one provider-facing User-Agent format. */
  readonly userAgent: string;
};

type CollectCapDef<TSchema extends z.ZodType, TSnap> = Omit<
  CapabilityDef<TSchema>,
  "run" | "interpret"
> & {
  schema: z.ZodType<TSnap>;
  /** Names the report in the "Invalid ... report.json" error. Defaults to the Cap id. */
  reportLabel?: string;
  fetch: (
    ctx: CapContext<z.infer<TSchema>>,
    env: CollectFetchEnv
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
  const { schema, reportLabel: label, fetch, interpretSnap, ...meta } = def;
  const reportLabel = label ?? meta.id;
  const env: CollectFetchEnv = { userAgent: watchdogUserAgent(meta.id) };
  return defineCapability({
    ...meta,
    kind: meta.kind ?? "collect",
    run: (ctx) =>
      Effect.gen(function* collectCapRun() {
        const { snap, artifactName } = yield* fetch(ctx, env);
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
