import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

/** Stand-in for `drizzle-kit generate`: writes whatever the test asks for. */
function repoWithGenerator(shell: string) {
  const repo = createGateRepo(["check-migrations.mjs"]);
  repo.write("packages/db/drizzle/0000_baseline.sql", "CREATE TABLE a ();\n");
  repo.write("packages/db/drizzle/meta/_journal.json", '{"entries":[]}\n');
  repo.commitAll("baseline");
  return { repo, env: { WD_MIGRATIONS_GENERATE_CMD: shell } };
}

describe("check-migrations", () => {
  it("passes when generate produces nothing", () => {
    const { repo, env } = repoWithGenerator("true");
    const res = repo.run("check-migrations.mjs", [], env);
    expect(res.code).toBe(0);
    expect(res.output).toContain("check:migrations: ok");
  });

  it("fails when generate writes a new migration, and rolls it back", () => {
    const { repo, env } = repoWithGenerator(
      "echo 'ALTER TABLE a ADD b int;' > packages/db/drizzle/0001_migration_drift_check.sql"
    );
    const res = repo.run("check-migrations.mjs", [], env);
    expect(res.code).toBe(1);
    expect(res.output).toContain("schema has changed without a migration");
    expect(res.output).toContain("0001_migration_drift_check.sql");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("fails when generate changes the journal, and restores it", () => {
    const { repo, env } = repoWithGenerator(
      "echo '{\"entries\":[1]}' > packages/db/drizzle/meta/_journal.json"
    );
    const res = repo.run("check-migrations.mjs", [], env);
    expect(res.code).toBe(1);
    expect(res.output).toContain("modified meta/_journal.json");
    expect(repo.git("status", "--porcelain")).toBe("");
  });

  it("fails when generate itself fails", () => {
    const { repo, env } = repoWithGenerator("exit 3");
    const res = repo.run("check-migrations.mjs", [], env);
    expect(res.code).toBe(1);
    expect(res.output).toContain("generate failed");
  });
});
