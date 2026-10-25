import type { JsonValue } from "@watchdog/schemas/shared";
import { waybackHistorySnapshotSchema } from "@watchdog/tools/wayback";

import { internetArchive } from "../../providers";
import { contact, defineCapability } from "../../sdk";
import { pageHistoryInput } from "./input";
import { interpretPageHistoryReport } from "./interpret";
import {
  PAGE_HISTORY_CAP_ID,
  PAGE_HISTORY_TIMEOUT_MS,
  runPageHistory,
} from "./run";

export const pageHistory = defineCapability({
  id: PAGE_HISTORY_CAP_ID,
  provider: internetArchive,
  contacts: [contact.provider("web.archive.org")],
  title: "Page history",
  description:
    "Fetch every distinct version of a page from the Wayback Machine, oldest first, and summarize what changed between them. Each version is stored as Evidence.",
  dataSource: "web.archive.org",
  input: pageHistoryInput,
  // Up to 25 paced fetches; the run stops starting them in time to finish inside this.
  timeoutMs: PAGE_HISTORY_TIMEOUT_MS,
  kind: "collect",
  flags: ["slow"],
  useCases: ["Passive"],
  formOmit: ["entityId"],
  consumes: [{ kind: "url" }],
  produces: [
    { kind: "evidence", evidenceKind: "file" },
    { kind: "identifier", type: "url" },
  ],
  jobPolicy: {
    cacheTtlMs: 60 * 60_000,
  },
  run: (ctx) => runPageHistory(ctx),
  interpret(report: JsonValue, opts) {
    const parsed = waybackHistorySnapshotSchema.safeParse(report);
    if (!parsed.success) {
      throw new Error(
        `Invalid ${PAGE_HISTORY_CAP_ID} report.json shape: ${parsed.error.message}`
      );
    }
    return interpretPageHistoryReport(parsed.data, opts);
  },
});
