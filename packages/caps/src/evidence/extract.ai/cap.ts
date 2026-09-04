import { Effect } from "effect";

import {
  createWatchdogModel,
  processExtractDraftSchema,
  structuredExtractEffect,
  type EvidenceSnapshot,
} from "@watchdog/ai";
import { defineCapability, type CapContext } from "@watchdog/cap-sdk";
import {
  EVIDENCE_EXTRACT_AI_CAPABILITY_ID,
  IDENTIFIER_PLATFORM_SLUGS,
  trimmedOrUndefined,
} from "@watchdog/schemas";
import { ValidationVendorError } from "@watchdog/tools";

import {
  interpretProcessDraft,
  uploadProcessArtifacts,
} from "../lib/process-shared";
import { evidenceExtractAiInput } from "./input";

/** Local OpenAI-compatible default when AI_COMPAT_BASE_URL is unset. */
const DEFAULT_AI_COMPAT_BASE_URL = [
  "http",
  "://",
  "127.0.0.1:8080",
  "/v1",
].join("");

/**
 * Cap-owned extract instructions (kept local until a second consumer needs a shared store).
 * Schema enforcement is via processExtractDraftSchema — this text steers quality.
 */
function buildMessages(snapshot: EvidenceSnapshot): {
  system: string;
  prompt: string;
} {
  const system = [
    "You are Watchdog's Evidence extract assistant for OSINT investigators.",
    "Your job: pull structured identifiers, factual claims, and open questions from ONE Evidence blob so a human can Accept them into the Graph.",
    "",
    "Grounding (hard rules):",
    '- Use ONLY text inside the Evidence delimiters. No outside knowledge, DNS, WHOIS, breach DBs, or "everyone knows".',
    "- Never invent people, orgs, emails, handles, IPs, domains, dates, or links that are not written in the Evidence.",
    "- Meta lines (kind/label/mime) describe the capture — they are not extra facts to invent from.",
    "- Prefer a short evidenceQuote (verbatim span) on every identifier/claim/question when the source span is clear.",
    "- If the Evidence is empty, boilerplate, or useless: empty arrays + a one-line summary saying so.",
    "",
    "What goes where:",
    "- identifiers: concrete addressable values. type MUST be one of: email | handle | phone | url | crypto | credential | other.",
    "  email = full addresses; handle = usernames/@handles; phone = numbers as written;",
    '  url = http(s) links and bare domains that appear as hosts; crypto = wallet/addresses; credential = password/hash/token ONLY if present as a value (do not "interpret" passwords);',
    "  other = IPs, names-as-labels, or values that do not fit the above — put a brief notes hint.",
    `  platform: for type=handle (and email/crypto when useful), prefer a known slug: ${IDENTIFIER_PLATFORM_SLUGS.join(", ")}.`,
    "  If the site is not in that list, invent a short lowercase custom slug (e.g. boy_moment). Omit when unknown.",
    "  Map aliases to known slugs (X→twitter, ig→instagram, tg→telegram). Do not invent platforms not in the Evidence.",
    '  status: current | former | unknown — only when Evidence says so (e.g. "former Discord"); otherwise omit.',
    "- claims: short factual observations grounded in the text (one idea each). class defaults to observation; use allegation only when the text itself alleges; avoid assessment/motive/psychology.",
    "- questions: unresolved ambiguities, conflicts, or things that need verification — prefer questions over weak claims.",
    "",
    "Do NOT:",
    "- Emit confidence, Graph UUIDs, entity ids, or patch ops.",
    "- Duplicate the same identifier (same type+platform+value); normalize email casing; keep handles as written.",
    '- Turn speculative links ("probably the same person") into claims — make them questions.',
    "- Geocode IPs or assert household/attribution from co-occurrence alone — question it.",
    "- Pad with filler claims restating the whole document.",
    "",
    "summary: one short sentence of what was extracted (or why nothing was).",
  ].join("\n");

  const meta: string[] = [`kind: ${snapshot.kind}`];
  const trimmedLabel = snapshot.label?.trim();
  if (trimmedLabel !== undefined && trimmedLabel !== "")
    meta.push(`label: ${trimmedLabel}`);
  const trimmedMime = snapshot.mime?.trim();
  if (trimmedMime !== undefined && trimmedMime !== "")
    meta.push(`mime: ${trimmedMime}`);

  const prompt = [
    "Extract from the Evidence below into identifiers[], claims[], questions[], and optional summary.",
    "Stay inside the delimiters. Empty arrays are OK.",
    "",
    "### Evidence meta ###",
    meta.join("\n"),
    "### Evidence ###",
    snapshot.text,
    "### End Evidence ###",
  ].join("\n");

  return { system, prompt };
}

function resolveProvider(
  ctx: Pick<CapContext<unknown>, "getCredential" | "hasCredential">,
  modelOverride?: string
) {
  return Effect.gen(function* resolveProviderGen() {
    const hasAnthropic = yield* ctx.hasCredential("ANTHROPIC_API_KEY");
    if (hasAnthropic) {
      const apiKey = yield* ctx.getCredential("ANTHROPIC_API_KEY");
      return {
        kind: "anthropic" as const,
        apiKey,
        model: trimmedOrUndefined(modelOverride) ?? "claude-sonnet-4-20250514",
      };
    }
    const hasCompat = yield* ctx.hasCredential("AI_COMPAT_API_KEY");
    if (hasCompat) {
      const apiKey = yield* ctx.getCredential("AI_COMPAT_API_KEY");
      const hasBase = yield* ctx.hasCredential("AI_COMPAT_BASE_URL");
      const baseUrl = hasBase
        ? yield* ctx.getCredential("AI_COMPAT_BASE_URL")
        : DEFAULT_AI_COMPAT_BASE_URL;
      return {
        kind: "openai_compat" as const,
        baseUrl,
        apiKey,
        model: trimmedOrUndefined(modelOverride) ?? "default",
      };
    }
    return yield* new ValidationVendorError({
      message:
        "Missing LLM credential — set ANTHROPIC_API_KEY or AI_COMPAT_API_KEY (+ optional AI_COMPAT_BASE_URL) in Settings",
    });
  });
}

export const extractAi = defineCapability({
  id: EVIDENCE_EXTRACT_AI_CAPABILITY_ID,
  version: "1",
  title: "Extract Evidence (AI)",
  description:
    "LLM structured extract of identifiers, claims, and questions from held Evidence text when deterministic harvest is too shallow.",
  dataSource: "LLM structured extract",
  formOmit: ["entityId", "model"],
  input: evidenceExtractAiInput,
  timeoutMs: 120_000,
  kind: "process",
  flags: ["needs_key", "third_party", "slow"],
  egress: "third_party",
  consumes: [{ kind: "evidence", evidenceKind: "file" }],
  produces: [
    { kind: "identifier", type: "email" },
    { kind: "identifier", type: "handle" },
    { kind: "identifier", type: "url" },
  ],
  credentials: [
    { anyOf: ["ANTHROPIC_API_KEY", "AI_COMPAT_API_KEY"] },
    { name: "AI_COMPAT_BASE_URL", optional: true },
  ],
  jobPolicy: {
    needsEvidenceSnapshot: true,
    linkEvidenceFromInput: ["evidenceId"],
    markEvidenceProcessed: true,
  },
  run: (ctx) =>
    Effect.gen(function* extractAiRun() {
      const snapshot = ctx.evidenceSnapshot;
      if (!snapshot) {
        return yield* new ValidationVendorError({
          message: "EvidenceSnapshot missing — packer did not run",
        });
      }
      if (!snapshot.text.trim()) {
        const empty = processExtractDraftSchema.parse({
          identifiers: [],
          claims: [],
          questions: [],
          summary: "Empty Evidence text — skipped LLM",
        });
        const artifacts = yield* uploadProcessArtifacts(
          ctx.uploadArtifact,
          snapshot,
          empty
        );
        return { artifacts };
      }

      const provider = yield* resolveProvider(ctx, ctx.input.model);
      ctx.log(`AI extract via ${provider.kind} model=${provider.model}`);
      const model = createWatchdogModel(provider);
      const { system, prompt } = buildMessages(snapshot);
      const { object: draft, usage } = yield* structuredExtractEffect({
        model,
        schema: processExtractDraftSchema,
        instructions: system,
        prompt,
        abortSignal: ctx.signal,
        temperature: 0,
      }).pipe(
        Effect.mapError(
          (error) => new ValidationVendorError({ message: error.reason })
        )
      );
      if (usage) {
        ctx.log(
          `usage tokens in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"}`
        );
      }

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
        "AI extract found signal but no Entity attached — attach Entity and re-Process",
      empty: "AI extract produced no identifiers/claims/questions",
    });
  },
});
