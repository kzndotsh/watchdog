import { defineCommand, runMain } from "citty";

import { api, emit, wrapCommandTree } from "./client";
import { capsCmd } from "./commands/caps";
import { casesCmd } from "./commands/cases";
import { claimsCmd } from "./commands/claims";
import { credentialsCmd } from "./commands/credentials";
import { edgesCmd } from "./commands/edges";
import { entitiesCmd } from "./commands/entities";
import { eventsCmd } from "./commands/events";
import { evidenceCmd } from "./commands/evidence";
import { exportCmd } from "./commands/export";
import { graphCmd } from "./commands/graph";
import { identifiersCmd } from "./commands/identifiers";
import { jobsCmd } from "./commands/jobs";
import { proposalsCmd } from "./commands/proposals";
import { questionsCmd } from "./commands/questions";
import { loadCliEnv } from "./env";
import { CliExitError, fail, handleCliError } from "./io";

const ROOT_COMMANDS = [
  "cases",
  "entities",
  "evidence",
  "export",
  "jobs",
  "proposals",
  "graph",
  "caps",
  "credentials",
  "claims",
  "identifiers",
  "edges",
  "events",
  "questions",
] as const;

export const wdMain = defineCommand({
  meta: {
    name: "wd",
    version: "0.1.0",
    description: "Watchdog CLI — interact with the investigator API",
  },
  subCommands: {
    cases: casesCmd,
    entities: entitiesCmd,
    evidence: evidenceCmd,
    export: exportCmd,
    jobs: jobsCmd,
    proposals: proposalsCmd,
    graph: graphCmd,
    caps: capsCmd,
    credentials: credentialsCmd,
    claims: claimsCmd,
    identifiers: identifiersCmd,
    edges: edgesCmd,
    events: eventsCmd,
    questions: questionsCmd,
  },
  run: async () => {
    try {
      loadCliEnv();
    } catch {
      fail("CONFIG", "Set WD_API_KEY (and optional WD_API_URL) to use wd.", {
        help: [
          "export WD_API_KEY=<key>",
          "wd --help",
          `commands: ${ROOT_COMMANDS.join(", ")}`,
        ],
      });
    }
    const cases = await api().cases.list();
    emit({
      bin: "wd",
      description: "Watchdog investigator API CLI",
      count: cases.length,
      commands: [...ROOT_COMMANDS],
      help: ["wd cases list", "wd caps list", "wd --help"],
    });
  },
});

export async function boot(): Promise<void> {
  try {
    await runMain(wrapCommandTree(wdMain));
  } catch (error: unknown) {
    if (error instanceof CliExitError) {
      process.exit(error.exitCode);
    }
    handleCliError(error);
  }
}

if (process.env.VITEST !== "true") {
  void boot();
}
