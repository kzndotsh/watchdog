import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";

import type { CapArtifact } from "@watchdog/cap-sdk";
import {
  decodeHtml,
  extractOutboundFromHtml,
  extractOutboundFromMarkdown,
  extractTitle,
  htmlToMarkdownish,
  htmlToText,
  isHtml,
  isMarkdown,
  type FetchBytesResult,
  type ToolsTag,
} from "@watchdog/tools";

import { fetchBytesEffect } from "./fetch-bytes";
import {
  ACCEPT_MARKDOWN_FIRST,
  type IngestResult,
  type StepResult,
} from "./types";

type UploadFn = (input: {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}) => Effect.Effect<CapArtifact, ToolsTag>;

interface IngestRemotePageOpts {
  fetchUrl: string;
  /** Base URL for resolving relative hrefs (usually the live page URL). */
  linkBaseUrl: string;
  signal: AbortSignal;
  label: "live" | "wayback";
  uploadArtifact: UploadFn;
  log: (message: string) => void;
  /** Live may keep opaque/binary as text; Wayback treats that as failure. */
  allowPlainBinary: boolean;
  stepExtras?: Partial<StepResult>;
}

interface IngestContext {
  fetched: FetchBytesResult;
  step: StepResult;
  label: IngestRemotePageOpts["label"];
  linkBaseUrl: string;
  uploadArtifact: UploadFn;
  log: IngestRemotePageOpts["log"];
}

function buildStep(
  fetched: FetchBytesResult,
  stepExtras?: Partial<StepResult>
): StepResult {
  return {
    ok: false,
    status: fetched.status,
    bytes: fetched.bytes.byteLength,
    contentType: fetched.contentType ?? undefined,
    mdMethod: "none",
    ...(fetched.markdownTokensHint === undefined
      ? {}
      : { markdownTokensHint: fetched.markdownTokensHint }),
    ...(fetched.error !== undefined && fetched.error !== ""
      ? { error: fetched.error }
      : {}),
    ...stepExtras,
  };
}

function ingestMarkdownContent(
  ctx: IngestContext
): Effect.Effect<IngestResult, ToolsTag> {
  return Effect.gen(function* ingestMarkdownContentGen() {
    const { fetched, step, label, uploadArtifact, log } = ctx;
    const md = decodeHtml(fetched.bytes).slice(0, 200_000);
    step.ok = fetched.ok;
    step.mdMethod = "native_markdown";
    const artifacts = [
      yield* uploadArtifact({
        bytes: new TextEncoder().encode(md),
        mime: "text/markdown; charset=utf-8",
        name: `${label}.md`,
      }),
    ];
    log(
      `${label} native markdown status=${fetched.status} tokens~${fetched.markdownTokensHint ?? "?"}`
    );
    return {
      step,
      text: md,
      urls: extractOutboundFromMarkdown(md),
      emails: [],
      artifacts,
    };
  });
}

function ingestHtmlContent(
  ctx: IngestContext
): Effect.Effect<IngestResult, ToolsTag> {
  return Effect.gen(function* ingestHtmlContentGen() {
    const { fetched, step, label, linkBaseUrl, uploadArtifact, log } = ctx;
    const html = decodeHtml(fetched.bytes);
    const title = extractTitle(html);
    const text = htmlToText(html);
    const fromHtml = extractOutboundFromHtml(html, linkBaseUrl);
    step.ok = fetched.ok;
    step.mdMethod = "html_convert";
    const artifacts = [
      yield* uploadArtifact({
        bytes: fetched.bytes,
        mime: "text/html; charset=utf-8",
        name: `${label}.html`,
      }),
      yield* uploadArtifact({
        bytes: new TextEncoder().encode(htmlToMarkdownish(html, title)),
        mime: "text/markdown; charset=utf-8",
        name: `${label}.md`,
      }),
    ];
    log(
      `${label} html→md status=${fetched.status} bytes=${fetched.bytes.byteLength} links=${fromHtml.urls.length}`
    );
    return {
      step,
      text,
      ...(title !== undefined && title !== "" ? { title } : {}),
      urls: fromHtml.urls,
      emails: fromHtml.emails,
      artifacts,
    };
  });
}

function ingestPlainBinaryContent(
  ctx: IngestContext
): Effect.Effect<IngestResult, ToolsTag> {
  return Effect.gen(function* ingestPlainBinaryContentGen() {
    const { fetched, step, label, uploadArtifact, log } = ctx;
    const text = decodeHtml(fetched.bytes).slice(0, 200_000);
    step.ok = fetched.ok;
    step.mdMethod = "plain_text";
    const artifacts = [
      yield* uploadArtifact({
        bytes: fetched.bytes,
        mime:
          fetched.contentType?.split(";")[0]?.trim() ??
          "application/octet-stream",
        name: `${label}.bin`,
      }),
    ];
    log(
      `${label} binary/text status=${fetched.status} bytes=${fetched.bytes.byteLength}`
    );
    return { step, text, urls: [], emails: [], artifacts };
  });
}

export function ingestRemotePageEffect(
  opts: IngestRemotePageOpts
): Effect.Effect<IngestResult, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* ingestRemotePageGen() {
    const {
      fetchUrl,
      linkBaseUrl,
      signal,
      label,
      uploadArtifact,
      log,
      allowPlainBinary,
      stepExtras,
    } = opts;

    const fetched = yield* fetchBytesEffect(
      fetchUrl,
      signal,
      ACCEPT_MARKDOWN_FIRST
    );
    const step = buildStep(fetched, stepExtras);
    const empty: IngestResult = {
      step,
      text: "",
      urls: [],
      emails: [],
      artifacts: [],
    };

    if (fetched.bytes.byteLength === 0) {
      log(`${label} failed: ${fetched.error ?? "empty"}`);
      return empty;
    }

    const ctx: IngestContext = {
      fetched,
      step,
      label,
      linkBaseUrl,
      uploadArtifact,
      log,
    };

    if (isMarkdown(fetched.contentType)) {
      return yield* ingestMarkdownContent(ctx);
    }
    if (isHtml(fetched.contentType, fetched.bytes)) {
      return yield* ingestHtmlContent(ctx);
    }
    if (allowPlainBinary) {
      return yield* ingestPlainBinaryContent(ctx);
    }

    step.error ??= "empty or non-HTML snapshot";
    log(`${label} fail: ${step.error}`);
    return empty;
  });
}
