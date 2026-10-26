import * as activity from "./procedures/activity";
import * as auth from "./procedures/auth";
import * as capabilities from "./procedures/capabilities";
import * as cases from "./procedures/cases";
import * as claims from "./procedures/claims";
import * as credentials from "./procedures/credentials";
import * as edges from "./procedures/edges";
import * as entities from "./procedures/entities";
import * as events from "./procedures/events";
import * as evidence from "./procedures/evidence";
import * as graph from "./procedures/graph";
import { health } from "./procedures/health";
import * as history from "./procedures/history";
import * as identifiers from "./procedures/identifiers";
import * as jobs from "./procedures/jobs";
import * as organization from "./procedures/organization";
import * as proposals from "./procedures/proposals";
import * as questions from "./procedures/questions";
import { ready } from "./procedures/ready";
import * as search from "./procedures/search";
import * as tasks from "./procedures/tasks";

export const router = {
  health,
  ready,
  auth: {
    whoami: auth.whoami,
  },
  activity: {
    listRecent: activity.listRecent,
  },
  search: {
    case: search.searchCaseProc,
  },
  capabilities: {
    list: capabilities.list,
    listPlaybooks: capabilities.listPlaybooksProc,
  },
  cases: {
    list: cases.list,
    get: cases.get,
    getBySlug: cases.getBySlug,
    counts: cases.counts,
    create: cases.create,
    update: cases.update,
    delete: cases.remove,
    restore: cases.restore,
    purge: cases.purge,
    listDeleted: cases.listDeleted,
    getDeletedBySlug: cases.getDeletedBySlug,
    deletionPolicy: cases.deletionPolicy,
  },
  entities: {
    list: entities.list,
    getMany: entities.getMany,
    get: entities.get,
    create: entities.create,
    update: entities.update,
    delete: entities.remove,
    recordAiHandoff: entities.recordAiHandoff,
  },
  claims: {
    list: claims.list,
    create: claims.create,
    update: claims.update,
    retract: claims.retract,
  },
  identifiers: {
    list: identifiers.list,
    getMany: identifiers.getMany,
    create: identifiers.create,
    update: identifiers.update,
    delete: identifiers.remove,
  },
  edges: {
    list: edges.list,
    getMany: edges.getMany,
    create: edges.create,
    update: edges.update,
    delete: edges.remove,
  },
  events: {
    list: events.list,
    create: events.create,
    update: events.update,
    delete: events.remove,
  },
  questions: {
    list: questions.list,
    create: questions.create,
    update: questions.update,
    resolve: questions.resolve,
    reopen: questions.reopen,
    delete: questions.remove,
  },
  history: {
    list: history.list,
  },
  organization: {
    getSettings: organization.getSettings,
    updateSettings: organization.updateSettings,
    getJobStartLimits: organization.getJobStartLimits,
    setJobStartLimit: organization.setJobStartLimit,
  },
  tasks: {
    list: tasks.list,
    board: tasks.board,
    due: tasks.due,
    get: tasks.get,
    create: tasks.create,
    update: tasks.update,
    remove: tasks.remove,
    reorder: tasks.reorder,
  },
  evidence: {
    list: evidence.list,
    pickerPage: evidence.pickerPage,
    getMany: evidence.getMany,
    get: evidence.get,
    listProviderCalls: evidence.listProviderCalls,
    createPaste: evidence.createPaste,
    createUrl: evidence.createUrl,
    softDelete: evidence.softDelete,
    restore: evidence.restore,
    attachEntity: evidence.attachEntity,
    presign: evidence.presign,
    confirmFile: evidence.confirmFile,
    downloadUrl: evidence.downloadUrl,
    process: evidence.process,
    enrich: evidence.enrich,
  },
  jobs: {
    listForCase: jobs.listForCase,
    get: jobs.get,
    listProviderCalls: jobs.listProviderCalls,
    start: jobs.start,
    cancel: jobs.cancel,
    retry: jobs.retry,
    startPlaybook: jobs.startPlaybook,
    getPlaybookRun: jobs.getPlaybookRun,
    cancelPlaybook: jobs.cancelPlaybook,
  },
  proposals: {
    listForCase: proposals.listForCase,
    queuePage: proposals.queuePage,
    get: proposals.get,
    create: proposals.create,
    accept: proposals.accept,
    reject: proposals.reject,
  },
  credentials: {
    list: credentials.list,
    put: credentials.put,
    delete: credentials.remove,
  },
  graph: {
    snapshot: graph.snapshot,
    ego: graph.ego,
    listWrites: graph.listWrites,
    write: graph.write,
  },
};

export type AppRouter = typeof router;
