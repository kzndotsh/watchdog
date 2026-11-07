import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-boundaries.mjs";

type Pkg = {
  readonly deps?: readonly string[];
  readonly exports?: Record<string, string>;
  readonly files?: Record<string, string>;
};

/** A workspace with `packages/<name>` and `apps/<name>` entries; names are unscoped. */
function workspace(packages: Record<string, Pkg>, apps: Record<string, Pkg>) {
  const repo = createGateRepo([GATE]);
  repo.write(
    "pnpm-workspace.yaml",
    'packages:\n  - "apps/*"\n  - "packages/*"\n'
  );
  repo.write(
    "packages/caps/capabilities.gen.json",
    JSON.stringify([
      {
        id: "net.probe.lookup",
        credentials: [
          { name: "PROBE_API_KEY" },
          { anyOf: ["EITHER_KEY_A", "EITHER_KEY_B"] },
        ],
      },
    ])
  );
  const emit = (dir: string, name: string, pkg: Pkg) => {
    repo.write(
      `${dir}/package.json`,
      JSON.stringify({
        name: `@watchdog/${name}`,
        exports: pkg.exports ?? { ".": "./src/index.ts" },
        dependencies: Object.fromEntries(
          (pkg.deps ?? []).map((d) => [`@watchdog/${d}`, "workspace:*"])
        ),
      })
    );
    repo.write(`${dir}/src/index.ts`, "export const x = 1;\n");
    for (const [rel, content] of Object.entries(pkg.files ?? {})) {
      repo.write(`${dir}/${rel}`, content);
    }
  };
  for (const [name, pkg] of Object.entries(packages)) {
    emit(`packages/${name}`, name, pkg);
  }
  for (const [name, pkg] of Object.entries(apps)) {
    emit(`apps/${name}`, name, pkg);
  }
  repo.commitAll("workspace");
  return repo;
}

const lib = {
  exports: {
    ".": "./src/index.ts",
    "./cases": "./src/cases/index.ts",
    "./ui/*": "./src/ui/*.tsx",
  },
};

describe("check-boundaries gate", () => {
  it("passes declared imports through declared exports", () => {
    const res = workspace(
      {
        lib,
        user: {
          deps: ["lib"],
          files: {
            "src/a.ts":
              'import { x } from "@watchdog/lib";\nimport type { C } from "@watchdog/lib/cases";\nimport { B } from "@watchdog/lib/ui/button";\nimport fs from "node:fs";\nimport { y } from "./b";\n',
          },
        },
      },
      {}
    ).run(GATE);
    expect(res.code).toBe(0);
    expect(res.output).toContain("check:boundaries: ok");
  });

  it("fails an internal-path import and names the public entry points", () => {
    const res = workspace(
      {
        lib,
        user: {
          deps: ["lib"],
          files: {
            "src/a.ts": 'import { z } from "@watchdog/lib/src/cases/secret";\n',
          },
        },
      },
      {}
    ).run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/user/src/a.ts");
    expect(res.output).toContain("@watchdog/lib/src/cases/secret");
    expect(res.output).toContain("@watchdog/lib/cases");
    expect(res.output).toContain('"@watchdog/lib"');
  });

  it("fails a bare import of a package with no root export and lists its subpaths", () => {
    const res = workspace(
      {
        sub: {
          exports: {
            "./cases": "./src/cases/index.ts",
            "./jobs": "./src/jobs/index.ts",
          },
        },
        user: {
          deps: ["sub"],
          files: { "src/a.ts": 'import { z } from "@watchdog/sub";\n' },
        },
      },
      {}
    ).run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain('"@watchdog/sub" is not a public entry');
    expect(res.output).toContain('"@watchdog/sub/cases"');
    expect(res.output).toContain('"@watchdog/sub/jobs"');
  });

  it("fails a relative import that reaches into another package", () => {
    const res = workspace(
      {
        lib,
        user: {
          deps: ["lib"],
          files: {
            "src/a.ts": 'export { q } from "../../lib/src/cases/secret";\n',
          },
        },
      },
      {}
    ).run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain("@watchdog/lib");
    expect(res.output).toContain("@watchdog/lib/cases");
  });

  it("fails an undeclared workspace package and names the manifest fix", () => {
    const res = workspace(
      {
        lib,
        user: {
          files: { "src/a.ts": 'import { x } from "@watchdog/lib";\n' },
        },
      },
      {}
    ).run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/user/src/a.ts");
    expect(res.output).toContain("does not declare @watchdog/lib");
    expect(res.output).toContain("packages/user/package.json");
  });

  it("fails a package importing an app", () => {
    const res = workspace(
      {
        user: {
          deps: ["web"],
          files: { "src/a.ts": 'import { r } from "@watchdog/web";\n' },
        },
      },
      { web: {} }
    ).run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/user/src/a.ts");
    expect(res.output).toContain("@watchdog/web is an app");
  });

  it("fails an app importing another app", () => {
    const res = workspace(
      {},
      {
        web: {
          deps: ["cli"],
          files: { "src/a.ts": 'import "@watchdog/cli";\n' },
        },
        cli: {},
      }
    ).run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain("@watchdog/cli is an app");
  });

  it("fails an import of a @watchdog package that does not exist", () => {
    const res = workspace(
      { user: { files: { "src/a.ts": 'import("@watchdog/ghost");\n' } } },
      {}
    ).run(GATE);
    expect(res.code).toBe(1);
    expect(res.output).toContain("@watchdog/ghost");
    expect(res.output).toContain("no workspace package");
  });

  it("lets apps import declared packages and a package import itself", () => {
    const res = workspace(
      {
        lib: {
          ...lib,
          files: {
            "src/self.ts": 'import { x } from "@watchdog/lib/cases";\n',
          },
        },
      },
      {
        web: {
          deps: ["lib"],
          files: { "src/a.ts": 'import "@watchdog/lib";\n' },
        },
      }
    ).run(GATE);
    expect(res.code).toBe(0);
  });

  it("accepts devDependencies for test files and ignores comments", () => {
    const repo = workspace(
      {
        lib,
        user: {
          files: {
            "src/a.test.ts": 'import { x } from "@watchdog/lib";\n',
            "src/b.ts":
              '// import { x } from "@watchdog/ghost";\n/* from "@watchdog/lib/src/x" */\n',
          },
        },
      },
      {}
    );
    repo.write(
      "packages/user/package.json",
      JSON.stringify({
        name: "@watchdog/user",
        devDependencies: { "@watchdog/lib": "workspace:*" },
      })
    );
    repo.commitAll("dev dep");
    expect(repo.run(GATE).code).toBe(0);
  });

  it("exempts only the generated client AppRouter alias from the relative rule", () => {
    const res = workspace(
      {
        api: {},
        client: {
          files: {
            "src/generated/app-router.ts":
              'export type { AppRouter } from "../../../api/src/router.ts";\n',
          },
        },
      },
      {}
    ).run(GATE);
    expect(res.code).toBe(0);
  });

  it("scans new untracked files so staged additions are checked", () => {
    const repo = workspace({ lib, user: { deps: [] } }, {});
    repo.write("packages/user/src/new.ts", 'import "@watchdog/lib";\n');
    expect(repo.run(GATE).code).toBe(1);
  });

  describe("specifier forms", () => {
    const BAD = "@watchdog/lib/src/secret";
    const forms: Record<string, string> = {
      "dynamic import on its own line": `const m = await import(\n  "${BAD}"\n);\n`,
      "vi.mock on its own line": `vi.mock(\n  "${BAD}",\n  () => ({})\n);\n`,
      "multi-line named import": `import {\n  a,\n  b\n} from "${BAD}";\n`,
      "import type": `import type { A } from "${BAD}";\n`,
      "multi-line import type": `import type {\n  A\n} from "${BAD}";\n`,
      "export star": `export * from "${BAD}";\n`,
      "require on its own line": `const r = require(\n  "${BAD}"\n);\n`,
      "side-effect import": `import "${BAD}";\n`,
    };

    it.each(Object.entries(forms))(
      "fails an internal path in %s",
      (_n, src) => {
        const res = workspace(
          { lib, user: { deps: ["lib"], files: { "src/a.ts": src } } },
          {}
        ).run(GATE);
        expect(res.code).toBe(1);
        expect(res.output).toContain(BAD);
      }
    );

    it("reports the line where a multi-line import starts", () => {
      const res = workspace(
        {
          lib,
          user: {
            deps: ["lib"],
            files: { "src/a.ts": `const x = 1;\nimport(\n  "${BAD}"\n);\n` },
          },
        },
        {}
      ).run(GATE);
      expect(res.output).toContain("packages/user/src/a.ts:2");
    });

    it("passes the same multi-line forms through public entries and ignores comments", () => {
      const src = [
        'const m = await import(\n  "@watchdog/lib/cases"\n);',
        'vi.mock(\n  "@watchdog/lib",\n  () => ({})\n);',
        'import {\n  a\n} from "@watchdog/lib/ui/button";',
        `// import { z } from "${BAD}";`,
        `/*\n * import { z } from "${BAD}";\n */`,
        "",
      ].join("\n");
      const res = workspace(
        { lib, user: { deps: ["lib"], files: { "src/a.ts": src } } },
        {}
      ).run(GATE);
      expect(res.code).toBe(0);
    });
  });

  describe("tools name no Cap id or Vault slot", () => {
    const tools = (files: Record<string, string>) =>
      workspace({ tools: { files } }, {}).run(GATE);

    it("passes a clean tools tree, and tests and testing helpers that name a Cap", () => {
      const res = tools({
        "src/a.ts": 'export const url = "https://example.com";\n',
        "src/__tests__/a.test.ts": 'export const id = "net.probe.lookup";\n',
        "src/testing/ids.ts": 'export const slot = "PROBE_API_KEY";\n',
        "src/b.ts": '// the Cap "net.probe.lookup" passes a key\n',
      });
      expect(res.code).toBe(0);
    });

    it("fails a Cap id planted in a tools file", () => {
      const res = tools({
        "src/a.ts": 'export const ua = ["x", "net.probe.lookup"].join(" ");\n',
      });
      expect(res.code).not.toBe(0);
      expect(res.output).toContain("packages/tools/src/a.ts:1");
      expect(res.output).toContain("net.probe.lookup");
      expect(res.output).toContain("Cap id");
    });

    it("fails a Vault slot named by a Cap's declared credential", () => {
      const res = tools({
        "src/a.ts": 'export const slot = "PROBE_API_KEY";\n',
      });
      expect(res.code).not.toBe(0);
      expect(res.output).toContain("Vault slot name");
    });

    it("fails a Vault slot named in a Cap's anyOf credential group", () => {
      const res = tools({
        "src/a.ts": "export const slot = 'EITHER_KEY_B';\n",
      });
      expect(res.code).not.toBe(0);
      expect(res.output).toContain("EITHER_KEY_B");
    });

    it("reads each literal to its own quote, so an apostrophe earlier on the line hides nothing", () => {
      const res = tools({
        "src/a.ts": 'export const m = ["Couldn\'t load", "PROBE_API_KEY"];\n',
      });
      expect(res.code).not.toBe(0);
      expect(res.output).toContain("PROBE_API_KEY");
    });

    it("fails a Cap id inside a longer literal, at the line it sits on in a template over several lines", () => {
      const res = tools({
        "src/a.ts": "export const ua = `watchdog/1.0\n(net.probe.lookup)`;\n",
      });
      expect(res.code).not.toBe(0);
      expect(res.output).toContain("packages/tools/src/a.ts:2");
      expect(res.output).toContain("net.probe.lookup");
    });

    it("does not match a Cap id or slot inside a longer name or host", () => {
      const res = tools({
        "src/a.ts":
          'export const a = "https://net.probe.lookup.example.com/x";\nexport const b = "MY_PROBE_API_KEY_2";\n',
      });
      expect(res.code).toBe(0);
    });

    it("applies only to packages/tools", () => {
      const res = workspace(
        {
          other: {
            files: { "src/a.ts": 'export const s = "PROBE_API_KEY";\n' },
          },
        },
        {}
      ).run(GATE);
      expect(res.code).toBe(0);
    });
  });
});
