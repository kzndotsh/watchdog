import { defineCommand } from "citty";

import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  getJobInputSchema,
  isJsonObject,
  jobInputObjectSchema,
  listJobsInputSchema,
  playbookSeedInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import { api, emit, emitList, fail, truncText } from "../client";
import {
  collapseJobListRows,
  enrichCancelPlaybookDisplay,
  enrichJobDisplay,
  enrichPlaybookRunDisplay,
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

const LIST_COLUMNS = [
  "id",
  "cap",
  "capLabel",
  "subject",
  "status",
  "statusLabel",
  "updated",
];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd jobs start -c ${caseId} --cap <capId>`,
    `wd jobs get -c ${caseId} <jobId>`,
  ]);
}

export const jobsCmd = defineNounCommand({
  meta: { name: "jobs", description: "Manage jobs" },
  listArgs: { ...caseArg },
  required: ["case"],
  usageHelp: ["wd jobs list -c <caseId>"],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const rows = await api().jobs.listForCase(
      listJobsInputSchema.parse({ caseId })
    );
    const collapsed = collapseJobListRows(rows);
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
        if (args.full) {
          emit(enriched);
          return;
        }
        emit({
          ...enriched,
          logs: truncText(row.logs.join("\n"), false),
        });
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
        description: "Cancel a queued, running, or blocked job",
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
