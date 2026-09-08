import { defineCommand } from "citty";

import { titleCase } from "@watchdog/schemas";

import { api, emitList } from "../client";
import { capEgressLabel, capKindLabel, capabilityIdLabel } from "../display";
import { asBoolean, defineNounCommand } from "../noun";

const LIST_COLUMNS = [
  "id",
  "kind",
  "kindLabel",
  "egress",
  "egressLabel",
  "title",
  "description",
];
const LIST_HELP = [
  "wd jobs start -c <caseId> --cap <capId>",
  "wd caps playbooks",
];

const PLAYBOOK_COLUMNS = ["id", "title", "seeds", "steps"];
const PLAYBOOK_HELP = ["wd jobs playbook -c <caseId> --id <playbookId>"];

export const capsCmd = defineNounCommand({
  meta: { name: "caps", description: "List capabilities and playbooks" },
  listArgs: {},
  required: [],
  usageHelp: LIST_HELP,
  list: async (args) => {
    const rows = await api().capabilities.list();
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindLabel: capKindLabel(r.kind),
        egress: r.egress,
        egressLabel: capEgressLabel(r.egress),
        title: r.title,
        description: r.description,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: LIST_HELP,
    });
  },
  mutations: {
    playbooks: defineCommand({
      meta: {
        name: "playbooks",
        description: "List Cap playbooks (curated Cap chains)",
      },
      args: {
        table: {
          type: "boolean",
          description: "ASCII table",
          default: false,
        },
        full: {
          type: "boolean",
          description: "No truncation / full fields",
          default: false,
        },
      },
      run: async ({ args }) => {
        const rows = await api().capabilities.listPlaybooks();
        emitList({
          items: rows.map((r) => ({
            id: r.id,
            title: r.title,
            seeds: r.seedKinds.map((kind) => titleCase(kind)).join(", "),
            steps: r.steps.map(capabilityIdLabel).join(" → "),
          })),
          columns: PLAYBOOK_COLUMNS,
          table: args.table,
          help: PLAYBOOK_HELP,
        });
      },
    }),
  },
});
