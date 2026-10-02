import type { CapArtifact } from "../../sdk";

/** How we got Markdown — mirrors markdown.new / CF Markdown-for-Agents tiers (in-process). */
export type MdMethod =
  | "native_markdown"
  | "html_convert"
  | "plain_text"
  | "none";

export interface StepResult {
  ok: boolean;
  error?: string;
  status?: number;
  bytes?: number;
  contentType?: string;
  archiveUrl?: string;
  timestamp?: string;
  mdMethod?: MdMethod;
  markdownTokensHint?: number;
}

export interface EnrichSummary {
  url: string;
  at: string;
  live: StepResult;
  wayback: StepResult;
  title?: string;
  textChars: number;
  linkCount: number;
  emailCount: number;
}

export interface IngestResult {
  step: StepResult;
  text: string;
  title?: string;
  urls: string[];
  emails: string[];
  artifacts: CapArtifact[];
}

export const URL_ENRICH_UA = "Watchdog/1.0 (+network.url.enrich)";
export const URL_ENRICH_MAX_BYTES = 2_000_000;

/** Prefer native Markdown-for-Agents (CF), then HTML. Never proxies via markdown.new (OPSEC). */
export const ACCEPT_MARKDOWN_FIRST =
  "text/markdown, text/html;q=0.9, application/xhtml+xml;q=0.8, */*;q=0.1";
