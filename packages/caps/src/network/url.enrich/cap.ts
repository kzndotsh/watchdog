import { Effect } from "effect";

import { defineCapability } from "@watchdog/cap-sdk";
import {
  ENRICHED_MD_ARTIFACT,
  URL_ENRICH_CAPABILITY_ID,
} from "@watchdog/schemas";
import {
  formatLinksMarkdownSection,
  mergeUnique,
  ValidationVendorError,
} from "@watchdog/tools";

import { ingestRemotePageEffect } from "./ingest-page";
import { networkUrlEnrichInput } from "./input";
import type { EnrichSummary, IngestResult } from "./types";
import { closestWaybackTimestampEffect, waybackArchiveUrl } from "./wayback";

export const urlEnrich = defineCapability({
  id: URL_ENRICH_CAPABILITY_ID,
  version: "1",
  title: "Enrich URL",
  description:
    "Intake path for a URL seed: live fetch (prefer markdown) plus Wayback into Job Output. Process Caps turn that into Proposals.",
  dataSource: "live fetch + Wayback CDX",
  formOmit: ["entityId", "sourceEvidenceId"],
  input: networkUrlEnrichInput,
  timeoutMs: 180_000,
  kind: "enrich",
  flags: ["slow"],
  consumes: [{ kind: "url" }],
  produces: [{ kind: "evidence", evidenceKind: "url_archive" }],
  jobPolicy: {
    linkEvidenceFromInput: ["sourceEvidenceId", "evidenceId"],
  },
  run: (ctx) =>
    Effect.gen(function* urlEnrichRun() {
      const url = ctx.input.url.trim();
      ctx.log(`enrich ${url}`);

      const live = yield* ingestRemotePageEffect({
        fetchUrl: url,
        linkBaseUrl: url,
        signal: ctx.signal,
        label: "live",
        uploadArtifact: ctx.uploadArtifact,
        log: ctx.log,
        allowPlainBinary: true,
      });

      let wayback: IngestResult = {
        step: { ok: false, mdMethod: "none" },
        text: "",
        urls: [],
        emails: [],
        artifacts: [],
      };
      const ts = yield* closestWaybackTimestampEffect(url, ctx.signal);
      if (ts !== null && ts !== "") {
        const archiveUrl = waybackArchiveUrl(ts, url);
        wayback = yield* ingestRemotePageEffect({
          fetchUrl: archiveUrl,
          linkBaseUrl: url,
          signal: ctx.signal,
          label: "wayback",
          uploadArtifact: ctx.uploadArtifact,
          log: ctx.log,
          allowPlainBinary: false,
          stepExtras: { timestamp: ts, archiveUrl },
        });
      } else {
        wayback.step.error = "no CDX snapshot found";
        ctx.log("wayback: no snapshot");
      }

      const title = live.title ?? wayback.title;
      const outboundUrls = mergeUnique(live.urls, wayback.urls);
      const outboundEmails = mergeUnique(live.emails, wayback.emails);
      const artifacts = [...live.artifacts, ...wayback.artifacts];

      const parts: string[] = [];
      if (live.text.trim()) {
        parts.push(`## Live fetch\n\nSource: ${url}\n\n${live.text}`);
      }
      if (wayback.text.trim() && wayback.text !== live.text) {
        parts.push(
          `## Wayback ${wayback.step.timestamp ?? ""}\n\n${wayback.step.archiveUrl ?? ""}\n\n${wayback.text}`
        );
      }
      if (outboundUrls.length > 0 || outboundEmails.length > 0) {
        parts.push(
          formatLinksMarkdownSection({
            urls: outboundUrls,
            emails: outboundEmails,
          })
        );
      }
      const combined = parts.join("\n\n---\n\n").trim();
      if (!combined) {
        return yield* new ValidationVendorError({
          message: `URL enrich found no usable content (live: ${live.step.error ?? live.step.status}; wayback: ${wayback.step.error ?? "n/a"})`,
        });
      }

      artifacts.push(
        yield* ctx.uploadArtifact({
          bytes: new TextEncoder().encode(combined),
          mime: "text/markdown; charset=utf-8",
          name: ENRICHED_MD_ARTIFACT,
        }),
        yield* ctx.uploadArtifact({
          bytes: new TextEncoder().encode(
            JSON.stringify(
              {
                url,
                urls: outboundUrls,
                emails: outboundEmails,
                at: new Date().toISOString(),
              },
              null,
              2
            )
          ),
          mime: "application/json",
          name: "links.json",
        })
      );

      const summary: EnrichSummary = {
        url,
        at: new Date().toISOString(),
        live: live.step,
        wayback: wayback.step,
        ...(title !== undefined && title !== "" ? { title } : {}),
        textChars: combined.length,
        linkCount: outboundUrls.length,
        emailCount: outboundEmails.length,
      };
      artifacts.push(
        yield* ctx.uploadArtifact({
          bytes: new TextEncoder().encode(JSON.stringify(summary, null, 2)),
          mime: "application/json",
          name: "enrich-summary.json",
        })
      );

      ctx.log(
        `enrich done textChars=${combined.length} links=${outboundUrls.length} emails=${outboundEmails.length} artifacts=${artifacts.length}`
      );
      return { artifacts };
    }),
});
