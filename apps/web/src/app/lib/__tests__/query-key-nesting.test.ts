import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { activityKeys, activityListView } from "@/domains/activity/queries";
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
import { artifactKeys, jobsKeys } from "@/domains/jobs/jobs-keys";
import { organizationKeys } from "@/domains/organization/queries";
import { searchKeys } from "@/domains/search/queries";
import { credentialsKeys, usersKeys } from "@/domains/settings/queries";
import { taskListView, tasksKeys } from "@/domains/tasks/queries";
import { proposalListView, proposalsKeys } from "@/domains/triage/queries";

type Key = readonly unknown[];

const CASE = "case-1";
const ID = "id-1";

/** One factory: its `all`, one call of every other member (sample args), and the members never called. */
type Factory = {
  readonly name: string;
  readonly all: Key;
  readonly keys: readonly Key[];
  /** Members besides `all` the samples never called: a new member fails until it is sampled. */
  readonly uncovered: readonly string[];
};

function factory<T extends object>(
  name: string,
  all: Key,
  members: T,
  sample: (keys: T) => Key[]
): Factory {
  const called = new Set<string>();
  const recording = new Proxy(members, {
    get(target, member, receiver) {
      const value: unknown = Reflect.get(target, member, receiver);
      if (typeof value !== "function" || typeof member !== "string") {
        return value;
      }
      return (...args: unknown[]): unknown => {
        called.add(member);
        // oxlint-disable-next-line anti-slop/no-reflect-apply -- a test-only recording proxy forwards any factory member unchanged; the member set is what is under test
        return Reflect.apply(value, target, args);
      };
    },
  });
  return {
    name,
    all,
    keys: sample(recording),
    uncovered: Object.keys(members).filter(
      (member) => member !== "all" && !called.has(member)
    ),
  };
}

const factories: readonly Factory[] = [
  factory("activityKeys", activityKeys.all, activityKeys, () => []),
  factory("casesKeys", casesKeys.all, casesKeys, (k) => [
    k.context(),
    k.detail(CASE),
    k.bySlug("alpha"),
    k.deletedBySlug("alpha"),
    k.counts(),
    k.casesCounts(CASE, "2026-01-01"),
    k.deletionPolicy(),
    k.deletionPolicy(CASE),
  ]),
  factory("collectKeys", collectKeys.all(CASE), collectKeys, (k) => [
    k.item(CASE, ID, true),
    k.item(CASE, ID, false),
  ]),
  factory("claimsKeys", claimsKeys.all(CASE), claimsKeys, () => []),
  factory("edgesKeys", edgesKeys.all(CASE), edgesKeys, (k) => [
    k.graphSnapshot(CASE),
    k.graphEgo(CASE, ID),
    k.byId(CASE, ID),
  ]),
  factory("entitiesKeys", entitiesKeys.all(CASE), entitiesKeys, (k) => [
    k.detail(CASE, "alpha"),
  ]),
  factory("eventsKeys", eventsKeys.all(CASE), eventsKeys, () => []),
  factory("historyKeys", historyKeys.all(CASE), historyKeys, (k) => [
    k.row(CASE, "claim", ID),
  ]),
  factory(
    "identifiersKeys",
    identifiersKeys.all(CASE),
    identifiersKeys,
    () => []
  ),
  factory("questionsKeys", questionsKeys.all(CASE), questionsKeys, () => []),
  factory("evidenceKeys", evidenceKeys.all(CASE), evidenceKeys, (k) => [
    k.urlDumps(CASE),
    k.recent(CASE),
    k.byId(CASE, ID),
    k.download(CASE, ID),
    k.providerCalls(CASE, ID),
  ]),
  factory("jobsKeys", jobsKeys.all(CASE), jobsKeys, (k) => [
    k.recent(CASE),
    k.detail(CASE, ID),
    k.playbookRun(CASE, ID),
    k.providerCalls(CASE, ID),
  ]),
  factory("artifactKeys", artifactKeys.all, artifactKeys, (k) => [
    k.job(CASE, ID, "sha", "text/plain"),
    k.evidence(CASE, ID, "text/plain"),
  ]),
  factory("organizationKeys", organizationKeys.all, organizationKeys, (k) => [
    k.stateAll(),
    k.state("user-1"),
    k.settings(),
    k.team(),
    k.userInvitations(),
    k.memberRole("org-1"),
    k.memberRole(undefined),
    k.slugAvailability("alpha"),
    k.invitationPreview(ID),
  ]),
  factory("searchKeys", searchKeys.all, searchKeys, (k) => [k.case(CASE, "q")]),
  factory("credentialsKeys", credentialsKeys.all, credentialsKeys, () => []),
  factory("usersKeys", usersKeys.all, usersKeys, () => []),
  factory("tasksKeys", tasksKeys.all(CASE), tasksKeys, (k) => [
    k.boards(CASE),
    k.board(CASE, {}),
    k.byId(CASE, ID),
    k.due(CASE, "2026-01-01"),
  ]),
  factory("proposalsKeys", proposalsKeys.all(CASE), proposalsKeys, (k) => [
    k.byId(CASE, ID),
    k.pendingSummary(CASE),
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
  ["activityListView", activityKeys.all, activityListView.prefix({})],
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
      expect(f.uncovered, "members never sampled").toEqual([]);
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
