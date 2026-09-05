import * as activity from "./procedures/activity";
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
import * as identifiers from "./procedures/identifiers";
import * as jobs from "./procedures/jobs";
import * as proposals from "./procedures/proposals";
import * as questions from "./procedures/questions";
import * as search from "./procedures/search";
import * as tasks from "./procedures/tasks";

export const router = {
  health,
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
    create: cases.create,
    update: cases.update,
    delete: cases.remove,
  },
  entities: {
    list: entities.list,
    get: entities.get,
    create: entities.create,
    update: entities.update,
  },
  claims: {
    list: claims.list,
    create: claims.create,
    update: claims.update,
    retract: claims.retract,
  },
  identifiers: {
    list: identifiers.list,
    listForCase: identifiers.listForCase,
    create: identifiers.create,
    update: identifiers.update,
  },
  edges: {
    list: edges.list,
    listForCase: edges.listForCase,
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
  },
  tasks: {
    list: tasks.list,
    get: tasks.get,
    create: tasks.create,
    update: tasks.update,
    remove: tasks.remove,
    reorder: tasks.reorder,
  },
  evidence: {
    list: evidence.list,
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
    start: jobs.start,
    cancel: jobs.cancel,
    startPlaybook: jobs.startPlaybook,
    cancelPlaybook: jobs.cancelPlaybook,
  },
  proposals: {
    listForCase: proposals.listForCase,
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
    listWrites: graph.listWrites,
    write: graph.write,
  },
};

export type AppRouter = typeof router;
