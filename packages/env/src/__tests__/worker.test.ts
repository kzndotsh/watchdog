import { describe, expect, it } from "vitest";

import { applyWorkerDatabaseUrl } from "../worker";

const APP = "postgresql://watchdog_app:pw@db/watchdog";
const WORKER = "postgresql://watchdog_worker:pw@db/watchdog";

describe("applyWorkerDatabaseUrl (#720)", () => {
  it("connects the worker as the worker role when its URL is set", () => {
    const source: NodeJS.ProcessEnv = {
      DATABASE_URL: APP,
      DATABASE_URL_WORKER: ` ${WORKER} `,
    };
    applyWorkerDatabaseUrl(source);
    expect(source.DATABASE_URL).toBe(WORKER);
  });

  it.each([undefined, "", "  "])(
    "keeps DATABASE_URL when the worker URL is %j",
    (worker) => {
      const source: NodeJS.ProcessEnv = {
        DATABASE_URL: APP,
        DATABASE_URL_WORKER: worker,
      };
      applyWorkerDatabaseUrl(source);
      expect(source.DATABASE_URL).toBe(APP);
    }
  );
});
