import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateRepoFactory, type GateRepo } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-bundle-budget.mjs";
const BASELINE = "scripts/bundle-budget-baseline.json";
const DIST = "apps/web/dist";

type Measured = {
  readonly entry: number;
  readonly shell: number;
  readonly routes: Record<string, number>;
  readonly total: number;
};

/** Incompressible text of `n` characters, so a chunk's gzip size tracks `n` and is reproducible. */
const filler = (seed: string, n: number) => {
  let out = "";
  let block = seed;
  while (out.length < n) {
    block = createHash("sha256").update(block).digest("hex");
    out += block;
  }
  return out.slice(0, n);
};

/** A chunk of about `n` characters that statically imports `imports` (sibling chunks). */
const chunk = (seed: string, n: number, imports: readonly string[] = []) =>
  `${imports.map((file) => `import{a as ${seed}_${file.replaceAll(/\W/g, "_")}}from"./${file}";`).join("")}export const ${seed}="${filler(seed, n)}";`;

type Layout = Record<string, string>;

/**
 * The production-build shape the gate reads: a TanStack Start manifest under `server/assets`
 * and client chunks under `client/assets`. `lazy.js` is in no preload list: it only counts
 * toward the reported total.
 */
const build = (overrides: Layout = {}): Layout => ({
  "entry.js": chunk("entry", 40_000, ["vendor.js"]),
  "vendor.js": chunk("vendor", 40_000),
  "shell.js": chunk("shell", 30_000, ["entry.js"]),
  "route-a.js": chunk("routeA", 30_000, ["shell.js", "a-dep.js"]),
  "a-dep.js": chunk("aDep", 10_000),
  "route-b.js": chunk("routeB", 20_000, ["shell.js"]),
  "lazy.js": chunk("lazy", 60_000),
  ...overrides,
});

/** The manifest module imports its route table from JSON: no code is built from values. */
const MANIFEST_MODULE =
  'import routes from "./routes.json" with { type: "json" };var tsrStartManifest=()=>({routes});export{tsrStartManifest};';

const routeTable = (routes: Record<string, readonly string[]>) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries({
        __root__: ["entry.js"],
        "/_protected": ["shell.js"],
        ...routes,
      }).map(([id, files]) => [
        id,
        { preloads: files.map((file) => `/assets/${file}`) },
      ])
    )
  );

const ROUTES = {
  "/_protected/a/": ["route-a.js"],
  "/_protected/b/": ["route-b.js"],
};

function repoWithBuild(
  layout: Layout = build(),
  routes: Record<string, readonly string[]> = ROUTES
): GateRepo {
  const repo = createGateRepo([GATE]);
  repo.write("apps/web/package.json", '{"type":"module"}');
  for (const [file, content] of Object.entries(layout)) {
    repo.write(`${DIST}/client/assets/${file}`, content);
  }
  repo.write(
    `${DIST}/server/assets/_tanstack-start-manifest_v-fixture.js`,
    MANIFEST_MODULE
  );
  repo.write(`${DIST}/server/assets/routes.json`, routeTable(routes));
  repo.commitAll("fixture build");
  return repo;
}

const measure = (repo: GateRepo): Measured => {
  const res = repo.run(GATE, ["--json"]);
  expect(res.code, res.output).toBe(0);
  return JSON.parse(res.output) as Measured;
};

const writeBaseline = (repo: GateRepo, baseline: object) =>
  repo.write(BASELINE, JSON.stringify(baseline));

const readBaseline = (repo: GateRepo) =>
  JSON.parse(readFileSync(path.join(repo.dir, BASELINE), "utf-8")) as {
    entry: number;
    shell: number;
    routes: Record<string, number>;
  };

/** A baseline from which `measured` is `percent` higher (rounded to whole bytes). */
const grownBy = (measured: Measured, percent: number) => {
  const divisor = 1 + percent / 100;
  return {
    entry: Math.round(measured.entry / divisor),
    shell: Math.round(measured.shell / divisor),
    routes: Object.fromEntries(
      Object.entries(measured.routes).map(([id, size]) => [
        id,
        Math.round(size / divisor),
      ])
    ),
  };
};

/**
 * The `build()` shape with every chunk named `<name>-<hash>.js`, as Rollup names them, and the
 * imports and preload lists following the new names. Same code, different hash.
 */
const withHash = (hash: string) => {
  const named = (file: string) => file.replace(".js", `-${hash}.js`);
  const layout = Object.fromEntries(
    Object.entries(build()).map(([file, source]) => [
      named(file),
      source.replaceAll(
        /from"\.\/([^"]+)"/g,
        (_match, dep: string) => `from"./${named(dep)}"`
      ),
    ])
  );
  const repo = repoWithBuild(layout, {});
  repo.write(
    `${DIST}/server/assets/routes.json`,
    JSON.stringify({
      __root__: { preloads: [`/assets/${named("entry.js")}`] },
      "/_protected": { preloads: [`/assets/${named("shell.js")}`] },
      "/_protected/a/": { preloads: [`/assets/${named("route-a.js")}`] },
      "/_protected/b/": { preloads: [`/assets/${named("route-b.js")}`] },
    })
  );
  return repo;
};

describe("check-bundle-budget gate", () => {
  it("measures the entry, shell and own route chunks from the manifest", () => {
    const repo = repoWithBuild();

    const measured = measure(repo);

    // The shell closure holds entry + vendor + shell, so a route's own size excludes all three
    // and keeps only what it adds (its chunk plus the dependency only it imports).
    expect(measured.shell).toBeGreaterThan(measured.entry);
    expect(Object.keys(measured.routes).sort()).toEqual([
      "/_protected/a/",
      "/_protected/b/",
    ]);
    expect(measured.routes["/_protected/a/"]).toBeGreaterThan(
      measured.routes["/_protected/b/"]
    );
    expect(measured.total).toBeGreaterThan(measured.shell);
  });

  it("measures the same bytes when only the chunk hashes differ", () => {
    // A route chunk changing renames it, which rewrites the shell chunks that import it.
    const first = measure(withHash("Ab3_x-Zq"));
    const second = measure(withHash("Qz9-y_Kw"));

    expect(Object.keys(first.routes).sort()).toEqual([
      "/_protected/a/",
      "/_protected/b/",
    ]);
    expect(second).toEqual(first);
    expect(first.shell).toBeGreaterThan(first.entry);
  });

  it("still counts real code growth in a hashed chunk", () => {
    const base = measure(withHash("Ab3_x-Zq"));
    const grown = withHash("Ab3_x-Zq");
    grown.write(
      `${DIST}/client/assets/shell-Ab3_x-Zq.js`,
      chunk("shell", 60_000, ["entry-Ab3_x-Zq.js"])
    );

    expect(measure(grown).shell).toBeGreaterThan(base.shell + 10_000);
  });

  it("passes at the baseline", () => {
    const repo = repoWithBuild();
    writeBaseline(repo, grownBy(measure(repo), 0));

    const res = repo.run(GATE);

    expect(res.code, res.output).toBe(0);
    expect(res.output).toContain("check:bundle: ok");
    expect(res.output).toContain("reported, not gated");
  });

  it("fails when the entry grows by 6%", () => {
    const repo = repoWithBuild();
    const baseline = grownBy(measure(repo), 0);
    writeBaseline(repo, {
      ...baseline,
      entry: Math.round(measure(repo).entry / 1.06),
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("entry (__root__ closure)");
    expect(res.output).toContain("limit +5%");
    expect(res.output).toContain("check:bundle --update");
  });

  it("fails when a route's own chunks grow by 6%", () => {
    const repo = repoWithBuild();
    const measured = measure(repo);
    const baseline = grownBy(measured, 0);
    writeBaseline(repo, {
      ...baseline,
      routes: {
        ...baseline.routes,
        "/_protected/a/": Math.round(measured.routes["/_protected/a/"] / 1.06),
      },
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("route /_protected/a/");
    expect(res.output).not.toContain("route /_protected/b/");
  });

  it("fails when the signed-in shell grows by 6%", () => {
    const repo = repoWithBuild();
    writeBaseline(repo, grownBy(measure(repo), 6));

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("signed-in shell");
  });

  it("passes when everything grows by 4%", () => {
    const repo = repoWithBuild();
    writeBaseline(repo, grownBy(measure(repo), 4));

    const res = repo.run(GATE);

    expect(res.code, res.output).toBe(0);
    expect(res.output).toContain("check:bundle: ok");
  });

  it("accepts a shrink, says how to lock it in, and --update ratchets the baseline down", () => {
    const repo = repoWithBuild();
    const measured = measure(repo);
    // Baseline from a bigger past build: today's build is smaller than it.
    const baseline = grownBy(measured, -20);
    writeBaseline(repo, baseline);

    const res = repo.run(GATE);
    expect(res.code, res.output).toBe(0);
    expect(res.output).toContain("check:bundle --update");

    const update = repo.run(GATE, ["--update"]);
    expect(update.code, update.output).toBe(0);
    expect(readBaseline(repo)).toEqual({
      entry: measured.entry,
      shell: measured.shell,
      routes: measured.routes,
    });
    expect(repo.run(GATE).output).not.toContain("--update");
  });

  it("--update never raises a number, and still fails on real growth", () => {
    const repo = repoWithBuild();
    const baseline = grownBy(measure(repo), 6);
    writeBaseline(repo, baseline);

    const res = repo.run(GATE, ["--update"]);

    expect(res.code).toBe(1);
    expect(readBaseline(repo)).toEqual(baseline);
  });

  it("fails on a route missing from the baseline and --update adds it", () => {
    const repo = repoWithBuild();
    const baseline = grownBy(measure(repo), 0);
    const { "/_protected/b/": _dropped, ...withoutB } = baseline.routes;
    writeBaseline(repo, { ...baseline, routes: withoutB });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("route /_protected/b/");
    expect(res.output).toContain("new route");

    const update = repo.run(GATE, ["--update"]);
    expect(update.code, update.output).toBe(0);
    expect(readBaseline(repo).routes).toHaveProperty("/_protected/b/");
    expect(repo.run(GATE).code).toBe(0);
  });

  it("passes when a baselined route is gone and --update drops it", () => {
    const repo = repoWithBuild();
    const baseline = grownBy(measure(repo), 0);
    writeBaseline(repo, {
      ...baseline,
      routes: { ...baseline.routes, "/_protected/gone/": 5000 },
    });

    const res = repo.run(GATE);
    expect(res.code, res.output).toBe(0);
    expect(res.output).toContain("1 baseline route(s) are gone");

    repo.run(GATE, ["--update"]);
    expect(readBaseline(repo).routes).not.toHaveProperty("/_protected/gone/");
  });

  it("does not gate total client size", () => {
    const repo = repoWithBuild();
    writeBaseline(repo, grownBy(measure(repo), 0));
    // A bigger lazy chunk no route preloads: total grows, nothing gated does.
    repo.write(`${DIST}/client/assets/lazy.js`, chunk("lazy", 600_000));

    const res = repo.run(GATE);

    expect(res.code, res.output).toBe(0);
    expect(res.output).toContain("total client JS");
  });

  it("fails and says to build first when there is no production build", () => {
    const repo = createGateRepo([GATE]);
    writeBaseline(repo, { entry: 1, shell: 1, routes: {} });
    repo.commitAll("no build");

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("no production web build");
    expect(res.output).toContain("pnpm build");
  });

  it("fails when the baseline is missing and --update creates it", () => {
    const repo = repoWithBuild();

    const res = repo.run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain("no readable baseline");

    const update = repo.run(GATE, ["--update"]);
    expect(update.code, update.output).toBe(0);
    expect(repo.run(GATE).code).toBe(0);
  });
});
