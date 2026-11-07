import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { activityKeys } from "@/domains/activity/queries";
import { casesKeys, deletedCaseListView } from "@/domains/cases/queries";
import { collectKeys } from "@/domains/collect/collect-keys";
import { collectListView } from "@/domains/collect/queries";
import { claimListView, claimsKeys } from "@/domains/entities/claims/queries";
import { edgeListView, edgesKeys } from "@/domains/entities/edges/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { eventListView, eventsKeys } from "@/domains/entities/events/queries";
import { historyKeys } from "@/domains/entities/history/queries";
import {
  identifierListView,
  identifiersKeys,
} from "@/domains/entities/identifiers/queries";
import { entityListView } from "@/domains/entities/queries";
import {
  questionListView,
  questionsKeys,
} from "@/domains/entities/questions/queries";
import { evidenceKeys, evidenceListView } from "@/domains/intake/queries";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { organizationKeys } from "@/domains/organization/queries";
import { searchKeys } from "@/domains/search/queries";
import { credentialsKeys, usersKeys } from "@/domains/settings/queries";
import { taskListView, tasksKeys } from "@/domains/tasks/queries";
import { proposalListView, proposalsKeys } from "@/domains/triage/queries";

type Key = readonly unknown[];

const CASE = "case-1";
const ID = "id-1";

/** One factory: its `all` and one call of every other member (sample args). */
type Factory = {
  readonly name: string;
  readonly all: Key;
  readonly keys: readonly Key[];
  /** Members besides `all`: a new one fails the count check until it is listed in `keys`. */
  readonly members: number;
};

function factory(name: string, all: Key, members: object, keys: Key[]) {
  return {
    name,
    all,
    keys,
    members: Object.keys(members).filter((member) => member !== "all").length,
  } satisfies Factory;
}

const factories: readonly Factory[] = [
  factory("activityKeys", activityKeys.all, activityKeys, [
    activityKeys.recent(),
    activityKeys.recent({}),
  ]),
  factory("casesKeys", casesKeys.all, casesKeys, [
    casesKeys.context(),
    casesKeys.detail(CASE),
    casesKeys.bySlug("alpha"),
    casesKeys.deletedBySlug("alpha"),
    casesKeys.counts(),
    casesKeys.casesCounts(CASE, "2026-01-01"),
    casesKeys.deletionPolicy(),
    casesKeys.deletionPolicy(CASE),
  ]),
  factory("collectKeys", collectKeys.all(CASE), collectKeys, [
    collectKeys.item(CASE, ID, true),
    collectKeys.item(CASE, ID, false),
  ]),
  factory("claimsKeys", claimsKeys.all(CASE), claimsKeys, []),
  factory("edgesKeys", edgesKeys.all(CASE), edgesKeys, [
    edgesKeys.graphSnapshot(CASE),
    edgesKeys.graphEgo(CASE, ID),
    edgesKeys.byId(CASE, ID),
  ]),
  factory("entitiesKeys", entitiesKeys.all(CASE), entitiesKeys, [
    entitiesKeys.detail(CASE, "alpha"),
  ]),
  factory("eventsKeys", eventsKeys.all(CASE), eventsKeys, []),
  factory("historyKeys", historyKeys.all(CASE), historyKeys, [
    historyKeys.row(CASE, "claim", ID),
  ]),
  factory("identifiersKeys", identifiersKeys.all(CASE), identifiersKeys, []),
  factory("questionsKeys", questionsKeys.all(CASE), questionsKeys, []),
  factory("evidenceKeys", evidenceKeys.all(CASE), evidenceKeys, [
    evidenceKeys.urlDumps(CASE),
    evidenceKeys.recent(CASE),
    evidenceKeys.byId(CASE, ID),
    evidenceKeys.download(CASE, ID),
    evidenceKeys.providerCalls(CASE, ID),
  ]),
  factory("jobsKeys", jobsKeys.all(CASE), jobsKeys, [
    jobsKeys.recent(CASE),
    jobsKeys.detail(CASE, ID),
    jobsKeys.playbookRun(CASE, ID),
    jobsKeys.providerCalls(CASE, ID),
    jobsKeys.jobArtifact(CASE, ID, "sha", "text/plain"),
    jobsKeys.evidenceArtifact(CASE, ID, "text/plain"),
  ]),
  factory("organizationKeys", organizationKeys.all, organizationKeys, [
    organizationKeys.stateAll(),
    organizationKeys.state("user-1"),
    organizationKeys.settings(),
    organizationKeys.team(),
    organizationKeys.userInvitations(),
    organizationKeys.memberRole("org-1"),
    organizationKeys.memberRole(undefined),
    organizationKeys.slugAvailability("alpha"),
    organizationKeys.invitationPreview(ID),
  ]),
  factory("searchKeys", searchKeys.all, searchKeys, [
    searchKeys.case(CASE, "q"),
  ]),
  factory("credentialsKeys", credentialsKeys.all, credentialsKeys, []),
  factory("usersKeys", usersKeys.all, usersKeys, []),
  factory("tasksKeys", tasksKeys.all(CASE), tasksKeys, [
    tasksKeys.boards(CASE),
    tasksKeys.board(CASE, {}),
    tasksKeys.byId(CASE, ID),
    tasksKeys.due(CASE, "2026-01-01"),
  ]),
  factory("proposalsKeys", proposalsKeys.all(CASE), proposalsKeys, [
    proposalsKeys.byId(CASE, ID),
    proposalsKeys.pendingSummary(CASE),
  ]),
];

/** A declared list's views: `listView` roots them at the domain's `all`. */
const listViews: readonly (readonly [string, Key, Key])[] = [
  [
    "collectListView",
    collectKeys.all(CASE),
    collectListView.prefix({ caseId: CASE }),
  ],
  [
    "claimListView",
    claimsKeys.all(CASE),
    claimListView.prefix({ caseId: CASE }),
  ],
  ["edgeListView", edgesKeys.all(CASE), edgeListView.prefix({ caseId: CASE })],
  [
    "entityListView",
    entitiesKeys.all(CASE),
    entityListView.prefix({ caseId: CASE }),
  ],
  [
    "eventListView",
    eventsKeys.all(CASE),
    eventListView.prefix({ caseId: CASE }),
  ],
  [
    "identifierListView",
    identifiersKeys.all(CASE),
    identifierListView.prefix({ caseId: CASE }),
  ],
  [
    "questionListView",
    questionsKeys.all(CASE),
    questionListView.prefix({ caseId: CASE }),
  ],
  [
    "evidenceListView",
    evidenceKeys.all(CASE),
    evidenceListView.prefix({ caseId: CASE }),
  ],
  ["taskListView", tasksKeys.all(CASE), taskListView.prefix({ caseId: CASE })],
  [
    "proposalListView",
    proposalsKeys.all(CASE),
    proposalListView.prefix({ caseId: CASE }),
  ],
  ["deletedCaseListView", casesKeys.all, deletedCaseListView.prefix({})],
];

function startsWith(key: Key, prefix: Key): boolean {
  return (
    key.length >= prefix.length &&
    prefix.every((part, index) => part === key[index])
  );
}

describe("Query key nesting", () => {
  it.each(factories.map((f) => [f.name, f] as const))(
    "%s: every key starts with its all",
    (_name, f) => {
      expect(f.keys.length).toBeGreaterThanOrEqual(f.members);
      for (const key of f.keys) {
        expect(startsWith(key, f.all), JSON.stringify(key)).toBe(true);
      }
    }
  );

  it.each(listViews)("%s sits under its domain's all", (_name, all, prefix) => {
    expect(startsWith(prefix, all)).toBe(true);
  });

  it("covers every exported key factory", () => {
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    const exported: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__" && entry.name !== "testing") {
            walk(file);
          }
        } else if (/\.tsx?$/.test(entry.name)) {
          const source = readFileSync(file, "utf-8");
          for (const match of source.matchAll(/export const (\w+Keys) = \{/g)) {
            exported.push(match[1] ?? "");
          }
        }
      }
    };
    walk(root);
    expect([...exported].sort()).toEqual(factories.map((f) => f.name).sort());
  });
});
