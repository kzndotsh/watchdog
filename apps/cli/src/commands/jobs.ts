import { defineCommand } from "citty";

import { isJsonObject } from "@watchdog/schemas";

import { api, emit, emitList, fail, truncText } from "../client";
import { resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  requiredCaseArg,
} from "../noun";

const LIST_COLUMNS = ["id", "cap", "status", "created"];

function listHelp(caseId: string): string[] {
  return [
    `wd jobs start -c ${caseId} --cap <capId>`,
    `wd jobs get -c ${caseId} <jobId>`,
  ];
}

export const jobsCmd = defineNounCommand({
  meta: { name: "jobs", description: "Manage jobs" },
  listArgs: { ...caseArg },
  required: ["case"],
  usageHelp: ["wd jobs list -c <caseId>"],
  list: async (args) => {
    const caseId = String(args.case);
    const rows = await api().jobs.listForCase({ caseId });
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        cap: r.capabilityId,
        status: r.status,
        created: r.createdAt.slice(0, 16),
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
        const row = await api().jobs.get({
          caseId: args.case,
          jobId: args.job,
        });
        if (args.full) {
          emit(row);
          return;
        }
        emit({ ...row, logs: truncText(row.logs.join("\n"), false) });
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
        let input: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(args.input);
          if (!isJsonObject(parsed)) {
            throw new Error("--input must be a JSON object");
          }
          input = parsed;
        } catch {
          fail("USAGE", "--input must be valid JSON", {
            help: [
              `wd jobs start -c ${args.case} --cap network.dns.lookup -i '{"host":"example.com"}'`,
            ],
          });
        }
        const row = await api().jobs.start({
          caseId: args.case,
          capabilityId: args.cap,
          input,
        });
        emit(row);
      },
    }),
    cancel: defineCommand({
      meta: { name: "cancel", description: "Cancel a queued/running job" },
      args: {
        ...requiredCaseArg,
        job: { type: "positional", description: "Job ID", required: true },
      },
      run: async ({ args }) => {
        const row = await api().jobs.cancel({
          caseId: args.case,
          jobId: args.job,
        });
        emit(row);
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
        const seed: Record<string, string> = {};
        if (args.host !== undefined && args.host !== "") seed.host = args.host;
        if (args.url !== undefined && args.url !== "") seed.url = args.url;
        if (args.evidence !== undefined && args.evidence !== "")
          seed.evidenceId = args.evidence;
        if (args.ip !== undefined && args.ip !== "") seed.ip = args.ip;
        if (args.email !== undefined && args.email !== "")
          seed.email = args.email;
        if (args.hash !== undefined && args.hash !== "") seed.hash = args.hash;
        if (args.handle !== undefined && args.handle !== "")
          seed.handle = args.handle;
        if (args.entity !== undefined && args.entity !== "") {
          seed.entityId = await resolveEntityId(args.case, args.entity);
        }
        const row = await api().jobs.startPlaybook({
          caseId: args.case,
          playbookId: args.id,
          seed,
        });
        emit(row);
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
        const row = await api().jobs.cancelPlaybook({
          caseId: args.case,
          playbookRunId: args.run,
        });
        emit(row);
      },
    }),
  },
});
