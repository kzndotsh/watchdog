import { Effect } from "effect";
import type { z } from "zod";

import type { JsonValue } from "@watchdog/schemas/shared";
import type { CredentialFingerprint } from "@watchdog/tools/breach";
import type { ToolsTag } from "@watchdog/tools/errors";

import {
  type BREACH_CAP_CATEGORY,
  validateCapability,
  type CapContext,
  type CapInterpretOpts,
  type CapInterpretResult,
  type CapServices,
  type BreachExportRedactor,
  type CapabilityDef,
  watchdogUserAgent,
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

/**
 * How a Case Export carries a breach Cap's snapshot: `"unchanged"` for a snapshot with no
 * credentials (parsed, so unknown content is refused, and kept), or a transform that cuts the
 * credential fields to their safe-mode attributes.
 */
export type BreachExportRedaction<TSnap> =
  | "unchanged"
  | ((snap: TSnap, fingerprint: CredentialFingerprint) => unknown);

/** Required for a breach Cap (an id under `breach.`), refused on any other. */
type BreachExportRedactionDecl<
  TId extends string,
  TSnap,
> = TId extends `${typeof BREACH_CAP_CATEGORY}.${string}`
  ? { exportRedaction: BreachExportRedaction<TSnap> }
  : { exportRedaction?: undefined };

type CollectCapDef<TSchema extends z.ZodType, TSnap, TId extends string> = Omit<
  CapabilityDef<TSchema, TId>,
  "run" | "interpret" | "exportRedactor"
> &
  BreachExportRedactionDecl<TId, TSnap> & {
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

function exportRedactorFor<TSnap>(
  schema: z.ZodType<TSnap>,
  redaction: BreachExportRedaction<TSnap> | undefined
): BreachExportRedactor | undefined {
  if (redaction === undefined) return undefined;
  return (value, fingerprint) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return null;
    const out =
      redaction === "unchanged"
        ? parsed.data
        : redaction(parsed.data, fingerprint);
    return JSON.stringify(out, null, 2);
  };
}

/** Collect/act Caps: JSON report pair upload + pure interpret(snap). */
export function defineCollectCap<
  TSchema extends z.ZodType,
  TSnap,
  const TId extends string,
>(def: CollectCapDef<TSchema, TSnap, TId>): CapabilityDef<TSchema, TId> {
  const {
    schema,
    reportLabel: label,
    fetch,
    interpretSnap,
    exportRedaction,
    ...meta
  } = def;
  const reportLabel = label ?? meta.id;
  const env: CollectFetchEnv = { userAgent: watchdogUserAgent(meta.id) };
  const exportRedactor = exportRedactorFor(schema, exportRedaction);
  // `CollectCapDef` demands `exportRedaction` for a breach id; `validateCapability` throws if a
  // breach Cap still has no redactor.
  const declared: CapabilityDef<TSchema, TId> = {
    ...meta,
    ...(exportRedactor === undefined ? {} : { exportRedactor }),
    kind: meta.kind ?? "collect",
    run: (ctx: CapContext<z.infer<TSchema>>) =>
      Effect.gen(function* collectCapRun() {
        const { snap, artifactName } = yield* fetch(ctx, env);
        const { report, artifact } = yield* uploadJsonReportPair(
          ctx.uploadArtifact,
          snap,
          artifactName
        );
        return { artifacts: [report, artifact] };
      }),
    interpret(report: JsonValue, opts: CapInterpretOpts<z.infer<TSchema>>) {
      const parsed = schema.safeParse(report);
      if (!parsed.success) {
        throw new Error(
          `Invalid ${reportLabel} report.json shape: ${parsed.error.message}`
        );
      }
      return interpretSnap(parsed.data, opts);
    },
  };
  return validateCapability(declared);
}
