import { defineCommand } from "citty";

import {
  createClaimInputSchema,
  listClaimsInputSchema,
  optionalClaimClassSchema,
  retractClaimInputSchema,
  trimmedClaimClassSchema,
  trimmedConfidenceTierSchema,
  trimmedRetractKindSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, emitOk, fail, truncText } from "../client";
import {
  guardChildWriteConfidence,
  refuseConfirmed,
  requireUserOverride,
  userOverrideArg,
} from "../custody";
import {
  claimClassLabel,
  confidenceLabel,
  enrichClaimDisplay,
} from "../display";
import { withExamples } from "../examples";
import {
  parseIdList,
  parsePatchIdList,
  requireCaseId,
  requireUuid,
  resolveEntityId,
} from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  entityArg,
  pickDefined,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";
import { parseCliEnum, parseOptionalCliEnum } from "../parse-cli";

const LIST_COLUMNS = [
  "id",
  "confidence",
  "confidenceLabel",
  "class",
  "classLabel",
  "text",
  "retracted",
];

function listHelp(caseId: string, entity: string): string[] {
  return [
    `wd claims create -c ${caseId} --entity ${entity} --text "…" --confidence unverified --user-override`,
  ];
}

export const claimsCmd = defineNounCommand({
  meta: {
    name: "claims",
    description: "Claims on an entity (writes need --user-override)",
  },
  listArgs: {
    ...caseArg,
    ...entityArg,
    retracted: {
      type: "boolean",
      description: "Include retracted claims",
      default: false,
    },
  },
  required: ["case", "entity"],
  usageHelp: ["wd claims list -c <caseId> --entity <slug>"],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().claims.list(
      listClaimsInputSchema.parse({
        caseId,
        entityId,
        includeRetracted: asBoolean(args.retracted) ?? false,
      })
    );
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        confidence: r.confidence,
        confidenceLabel: confidenceLabel(r.confidence),
        class: r.class,
        classLabel: claimClassLabel(r.class),
        text: truncText(r.text, full),
        retracted: r.retracted,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: listHelp(caseId, entity),
    });
  },
  mutations: {
    create: defineCommand({
      meta: {
        name: "create",
        description: withExamples("Create a claim (--user-override required)", [
          'wd claims create -c <caseId> --entity <slug> --text "…" --confidence unverified --user-override',
        ]),
      },
      args: {
        ...requiredCaseArg,
        ...requiredEntityArg,
        text: { type: "string", description: "Claim text", required: true },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
          required: true,
        },
        class: {
          type: "string",
          description: "Claim class",
          default: "observation",
        },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const confidence = parseCliEnum(
          trimmedConfidenceTierSchema,
          args.confidence,
          "--confidence",
          [
            `wd claims create -c ${caseId} --entity ${args.entity} --text "…" --confidence unverified --user-override`,
          ]
        );
        refuseConfirmed(confidence);
        const entityId = await resolveEntityId(caseId, args.entity);
        const evidenceIds = parseIdList(args.evidence);
        const payload = createClaimInputSchema.parse({
          caseId,
          entityId,
          text: args.text,
          confidence,
          class: parseCliEnum(
            trimmedClaimClassSchema,
            args.class,
            "claim class"
          ),
          ...pickDefined({ evidenceIds }),
        });
        const row = await api().claims.create({
          ...payload,
          userOverride: true,
        });
        emit(enrichClaimDisplay(row));
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description: "Update a claim (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        claim: {
          type: "positional",
          description: "Claim ID",
          required: true,
        },
        text: { type: "string", description: "Claim text" },
        class: { type: "string", description: "Claim class" },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
        },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const claimId = requireUuid(args.claim, "Claim ID");
        const confidenceValue = guardChildWriteConfidence(args.confidence);
        const evidenceIds = parsePatchIdList(args.evidence);
        const classValue = parseOptionalCliEnum(
          optionalClaimClassSchema,
          args.class,
          "claim class"
        );
        const parsed = updateClaimInputSchema.safeParse({
          caseId,
          claimId,
          ...(args.text === undefined ? {} : { text: args.text }),
          ...(classValue === undefined ? {} : { class: classValue }),
          ...(confidenceValue === undefined
            ? {}
            : { confidence: confidenceValue }),
          ...(evidenceIds === undefined ? {} : { evidenceIds }),
        });
        if (!parsed.success) {
          fail(
            "USAGE",
            "Provide at least one of --text, --class, --confidence, or --evidence",
            {
              help: [
                `wd claims update -c ${caseId} ${claimId} --text "…" --user-override`,
              ],
            }
          );
        }
        const row = await api().claims.update({
          ...parsed.data,
          userOverride: true,
        });
        emit(enrichClaimDisplay(row));
      },
    }),
    retract: defineCommand({
      meta: {
        name: "retract",
        description: "Retract a claim (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        claim: {
          type: "positional",
          description: "Claim ID",
          required: true,
        },
        kind: {
          type: "string",
          description: "Retract kind",
          required: true,
        },
        reason: {
          type: "string",
          description: "Reason",
          required: true,
        },
        ...dryRunArg,
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const claimId = requireUuid(args.claim, "Claim ID");
        const payload = retractClaimInputSchema.parse({
          caseId,
          claimId,
          kind: parseCliEnum(
            trimmedRetractKindSchema,
            args.kind,
            "retract kind",
            [
              `wd claims retract -c ${caseId} ${claimId} --kind <kind> --reason "…" --user-override`,
            ]
          ),
          reason: args.reason,
        });
        if (args["dry-run"]) {
          emitOk({
            dryRun: true,
            id: claimId,
            kind: payload.kind,
            reason: payload.reason,
          });
          return;
        }
        const row = await api().claims.retract({
          ...payload,
          userOverride: true,
        });
        emit(enrichClaimDisplay(row));
      },
    }),
  },
});
