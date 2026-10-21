import { defineCommand } from "citty";

import { playbookSeedInputSchema } from "@watchdog/schemas/caps";
import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  getJobInputSchema,
  getPlaybookRunInputSchema,
  jobInputObjectSchema,
  listJobsInputSchema,
  retryJobInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
} from "@watchdog/schemas/jobs";
import {
  isJsonObject,
  trimmedOrUndefined,
  PAGE_LIMIT_MAX,
} from "@watchdog/schemas/shared";
import type { Page } from "@watchdog/schemas/shared";

import { api, emit, emitList, fail, truncText } from "../client";
import {
  collapseJobListRows,
  enrichCancelPlaybookDisplay,
  enrichJobDisplay,
  enrichPlaybookRunDisplay,
  enrichPlaybookRunView,
} from "../display";
import { requireCaseId, requireUuid, resolveEntityId } from "../ids";
import { jobInputTitlesForJobs } from "../job-evidence-titles";
import { caseListHelp } from "../list-help";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  hasCliText,
  requiredCaseArg,
} from "../noun";
import { fetchListPage } from "../paging";
import type { PageParams } from "../paging";

const LIST_COLUMNS = [
  "id",
  "cap",
  "capLabel",
  "subject",
  "status",
  "statusLabel",
  "outcomeLabel",
  "updated",
];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd jobs start -c ${caseId} --cap <capId>`,
    `wd jobs get -c ${caseId} <jobId>`,
  ]);
}

/** Pages read past the requested one to finish a playbook run that spans a page boundary. */
const MAX_RUN_PAGES = 20;

type RunRow = { playbookRunId?: string | null; playbookStep?: number | null };

/** A run is whole once a step 0 Job of it is loaded (steps run in order, newest first here). */
function hasOpenRun(items: readonly RunRow[]): boolean {
  const started = new Set<string>();
  const seen = new Set<string>();
  for (const job of items) {
    if (job.playbookRunId === null || job.playbookRunId === undefined) continue;
    seen.add(job.playbookRunId);
    if (job.playbookStep === 0) started.add(job.playbookRunId);
  }
  return [...seen].some((runId) => !started.has(runId));
}

async function completeOpenRuns<Row extends RunRow>(
  first: Page<Row>,
  fetchPage: (params: PageParams) => Promise<Page<Row>>
): Promise<Page<Row>> {
  const items = [...first.items];
  let nextCursor = first.nextCursor;
  for (
    let extra = 0;
    nextCursor !== null && extra < MAX_RUN_PAGES && hasOpenRun(items);
    extra += 1
  ) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page names the cursor of the next
    const page = await fetchPage({ cursor: nextCursor, limit: PAGE_LIMIT_MAX });
    items.push(...page.items);
    nextCursor = page.nextCursor;
  }
  return { items, nextCursor };
}

export const jobsCmd = defineNounCommand({
  meta: { name: "jobs", description: "Manage jobs" },
  listArgs: { ...caseArg },
  required: ["case"],
  usageHelp: ["wd jobs list -c <caseId>"],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const fetchPage = async (params: PageParams) =>
      api().jobs.listForCase(listJobsInputSchema.parse({ caseId, ...params }));
    const first = await fetchListPage(fetchPage, args);
    // A playbook run shows as one row, so its steps must be read together: a page that ends
    // inside a run is read on until that run's first step is in hand.
    const page =
      args.all === true ? first : await completeOpenRuns(first, fetchPage);
    const collapsed = collapseJobListRows(page.items);
    const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
      caseId,
      collapsed
    );
    emitList({
      items: collapsed.map((r) => ({
        ...enrichJobDisplay(r, evidenceTitles, entityTitles),
        cap: r.playbookId ?? r.capabilityId,
        updated: (r.updatedAt ?? r.createdAt).slice(0, 16),
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      nextCursor: page.nextCursor,
      help: listHelp(caseId),
    });
  },
  mutations: {
    get: defineCommand({
      meta: {
        name: "get",
        description: "Get a job (logs truncated unless --full)",
      },
      args: {
        ...requiredCaseArg,
        job: { type: "positional", description: "Job ID", required: true },
        full: {
          type: "boolean",
          description: "Include full, untruncated logs",
          default: false,
        },
      },
      run: async ({ args }) => {
        const scope = getJobInputSchema.parse({
          caseId: requireCaseId(args.case),
          jobId: requireUuid(args.job, "Job ID"),
        });
        const row = await api().jobs.get(scope);
        const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
          scope.caseId,
          [row]
        );
        const enriched = enrichJobDisplay(row, evidenceTitles, entityTitles);
        // A step of a Playbook run also reads the run: its outcome and every step's outcome,
        // skipped steps (which have no Job) and their reasons included.
        const runId = row.playbookRunId;
        const playbookRun =
          runId === null || runId === undefined
            ? undefined
            : enrichPlaybookRunView(
                await api().jobs.getPlaybookRun(
                  getPlaybookRunInputSchema.parse({
                    caseId: scope.caseId,
                    playbookRunId: runId,
                  })
                )
              );
        const withRun =
          playbookRun === undefined ? enriched : { ...enriched, playbookRun };
        if (args.full) {
          emit(withRun);
          return;
        }
        emit({
          ...withRun,
          logs: truncText(row.logs.join("\n"), false),
        });
      },
    }),
    "playbook-run": defineCommand({
      meta: {
        name: "playbook-run",
        description:
          "Show a playbook run: its outcome and each step's outcome (skipped steps with the reason)",
      },
      args: {
        ...requiredCaseArg,
        run: {
          type: "positional",
          description: "Playbook run ID",
          required: true,
        },
      },
      run: async ({ args }) => {
        const scope = getPlaybookRunInputSchema.parse({
          caseId: requireCaseId(args.case),
          playbookRunId: requireUuid(args.run, "Playbook run ID"),
        });
        emit(enrichPlaybookRunView(await api().jobs.getPlaybookRun(scope)));
      },
    }),
    start: defineCommand({
      meta: { name: "start", description: "Start a capability job" },
      args: {
        ...requiredCaseArg,
        cap: { type: "string", description: "Capability ID", required: true },
        input: {
          type: "string",
          alias: "i",
          description: "JSON input (default: {})",
          default: "{}",
        },
      },
      run: async ({ args }) => {
        const caseId = requireCaseId(args.case);
        if (!hasCliText(args.cap)) {
          fail("USAGE", "--cap must not be blank", {
            help: [
              `wd jobs start -c ${caseId} --cap network.dns.lookup -i '{"host":"example.com"}'`,
            ],
          });
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(args.input.trim());
        } catch {
          fail("USAGE", "--input must be valid JSON", {
            help: [
              `wd jobs start -c ${caseId} --cap network.dns.lookup -i '{"host":"example.com"}'`,
            ],
          });
        }
        if (!isJsonObject(parsed)) {
          fail("USAGE", "--input must be a JSON object", {
            help: [
              `wd jobs start -c ${caseId} --cap network.dns.lookup -i '{"host":"example.com"}'`,
            ],
          });
        }
        const input = jobInputObjectSchema.parse(parsed);
        const row = await api().jobs.start(
          startJobInputSchema.parse({
            caseId,
            capabilityId: args.cap,
            input,
          })
        );
        const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
          caseId,
          [row]
        );
        emit(enrichJobDisplay(row, evidenceTitles, entityTitles));
      },
    }),
    cancel: defineCommand({
      meta: {
        name: "cancel",
        description: "Cancel a queued or running job",
      },
      args: {
        ...requiredCaseArg,
        job: { type: "positional", description: "Job ID", required: true },
      },
      run: async ({ args }) => {
        const scope = cancelJobInputSchema.parse({
          caseId: requireCaseId(args.case),
          jobId: requireUuid(args.job, "Job ID"),
        });
        const row = await api().jobs.cancel(scope);
        const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
          scope.caseId,
          [row]
        );
        emit(enrichJobDisplay(row, evidenceTitles, entityTitles));
      },
    }),
    retry: defineCommand({
      meta: {
        name: "retry",
        description:
          "Retry a finished job: a new job with the same capability and input",
      },
      args: {
        ...requiredCaseArg,
        job: { type: "positional", description: "Job ID", required: true },
      },
      run: async ({ args }) => {
        const scope = retryJobInputSchema.parse({
          caseId: requireCaseId(args.case),
          jobId: requireUuid(args.job, "Job ID"),
        });
        const row = await api().jobs.retry(scope);
        const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
          scope.caseId,
          [row]
        );
        emit(enrichJobDisplay(row, evidenceTitles, entityTitles));
      },
    }),
    playbook: defineCommand({
      meta: {
        name: "playbook",
        description: "Run a Cap playbook (sequential Jobs → Proposals)",
      },
      args: {
        ...requiredCaseArg,
        id: {
          type: "string",
          description: "Playbook id (e.g. host-footprint)",
          required: true,
        },
        host: { type: "string", description: "Seed host" },
        url: { type: "string", description: "Seed URL" },
        evidence: { type: "string", description: "Seed Evidence id" },
        ip: { type: "string", description: "Seed IP" },
        email: { type: "string", description: "Seed email" },
        hash: { type: "string", description: "Seed file hash" },
        handle: { type: "string", description: "Seed handle" },
        entity: {
          type: "string",
          description: "Attach Entity slug or UUID",
        },
      },
      run: async ({ args }) => {
        const caseId = requireCaseId(args.case);
        if (!hasCliText(args.id)) {
          fail("USAGE", "Playbook id must not be blank", {
            help: [
              `wd jobs playbook -c ${caseId} --id host-footprint --host example.com`,
            ],
          });
        }
        const seed: Record<string, string> = {};
        const host = trimmedOrUndefined(args.host);
        const url = trimmedOrUndefined(args.url);
        const evidenceRaw = trimmedOrUndefined(args.evidence);
        const ip = trimmedOrUndefined(args.ip);
        const email = trimmedOrUndefined(args.email);
        const hash = trimmedOrUndefined(args.hash);
        const handle = trimmedOrUndefined(args.handle);
        const entity = trimmedOrUndefined(args.entity);
        if (host !== undefined) seed.host = host;
        if (url !== undefined) seed.url = url;
        if (evidenceRaw !== undefined) {
          seed.evidenceId = requireUuid(evidenceRaw, "Evidence ID");
        }
        if (ip !== undefined) seed.ip = ip;
        if (email !== undefined) seed.email = email;
        if (hash !== undefined) seed.hash = hash;
        if (handle !== undefined) seed.handle = handle;
        if (entity !== undefined) {
          seed.entityId = await resolveEntityId(caseId, entity);
        }
        if (Object.keys(seed).length === 0) {
          fail("USAGE", "At least one playbook seed is required", {
            help: [
              `wd jobs playbook -c ${caseId} --id host-footprint --host example.com`,
            ],
          });
        }
        const parsedSeed = playbookSeedInputSchema.safeParse(seed);
        if (!parsedSeed.success) {
          fail("USAGE", "Invalid playbook seed (check URL is http/https)", {
            help: [
              `wd jobs playbook -c ${caseId} --id host-footprint --host example.com`,
            ],
          });
        }
        const row = await api().jobs.startPlaybook(
          startPlaybookInputSchema.parse({
            caseId,
            playbookId: args.id,
            seed: parsedSeed.data,
          })
        );
        const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
          caseId,
          row.jobs
        );
        emit(enrichPlaybookRunDisplay(row, evidenceTitles, entityTitles));
      },
    }),
    "cancel-playbook": defineCommand({
      meta: {
        name: "cancel-playbook",
        description: "Cancel a running playbook run",
      },
      args: {
        ...requiredCaseArg,
        run: {
          type: "positional",
          description: "Playbook run ID",
          required: true,
        },
      },
      run: async ({ args }) => {
        const scope = cancelPlaybookInputSchema.parse({
          caseId: requireCaseId(args.case),
          playbookRunId: requireUuid(args.run, "Playbook run ID"),
        });
        const row = await api().jobs.cancelPlaybook(scope);
        emit(enrichCancelPlaybookDisplay(row));
      },
    }),
  },
});
