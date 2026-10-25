import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CapCrawler,
  capEntryFiles,
  isExcludedFromFingerprint,
  parseLockfileImporters,
} from "../cap-fingerprint";
import { CAPABILITIES } from "../registry";

let root = "";

function write(rel: string, text: string): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function lockfile(zod: string): string {
  return `lockfileVersion: '9.0'

importers:

  .: {}

  packages/tools:
    dependencies:
      zod:
        specifier: 'catalog:'
        version: ${zod}
      undici:
        specifier: 'catalog:'
        version: 8.0.0(foo@1.0.0)
`;
}

/** Two Caps import different vendors through one barrel; a third imports only a type. */
function buildFixture(): void {
  write(
    "tsconfig.json",
    `{
  // comment
  "compilerOptions": { "paths": { "@fx/lib": ["./packages/tools/src/index.ts"], "@fx/safe-fetch": ["./packages/tools/src/http/safe-fetch.ts"] } },
}`
  );
  write("pnpm-lock.yaml", lockfile("4.0.0"));
  write("packages/tools/package.json", "{}");
  write("packages/caps/package.json", "{}");
  write(
    "packages/tools/src/index.ts",
    'export { vendorA } from "./vendor-a";\nexport { vendorB } from "./vendor-b";\nexport * from "./star";\n'
  );
  write(
    "packages/tools/src/vendor-a.ts",
    'import { z } from "zod";\nexport const vendorA = z.string();\n'
  );
  write(
    "packages/tools/src/vendor-b.ts",
    'import { fetchIt } from "./http/fetch-json";\nexport const vendorB = fetchIt;\n'
  );
  write("packages/tools/src/star.ts", "export const starred = 1;\n");
  write("packages/tools/src/http/fetch-json.ts", "export const fetchIt = 1;\n");
  write(
    "packages/tools/src/http/safe-fetch.ts",
    'import { Agent } from "undici";\nexport const guard = Agent;\n'
  );
  write(
    "packages/caps/src/a/cap.ts",
    'import { vendorA } from "@fx/lib";\nimport { guard } from "@fx/safe-fetch";\nexport const a = [vendorA, guard];\n'
  );
  write(
    "packages/caps/src/b/cap.ts",
    'import { vendorB } from "@fx/lib";\nexport const b = vendorB;\n'
  );
  write(
    "packages/caps/src/c/cap.ts",
    'import type { vendorA } from "@fx/lib";\nimport { starred } from "@fx/lib";\nexport const c = starred;\n'
  );
}

function fingerprints(): Record<string, string> {
  const crawler = new CapCrawler(root);
  const out: Record<string, string> = {};
  for (const id of ["a", "b", "c"]) {
    out[id] = crawler.fingerprint(
      path.join(root, `packages/caps/src/${id}/cap.ts`)
    );
  }
  return out;
}

describe("cap fingerprint crawl", () => {
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "wd492-fp-"));
    buildFixture();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("follows a barrel to the defining module, so one vendor reaches only its Caps", () => {
    const crawler = new CapCrawler(root);
    const a = crawler.crawl(path.join(root, "packages/caps/src/a/cap.ts"));
    expect(a.files).toEqual([
      "packages/caps/src/a/cap.ts",
      "packages/tools/src/vendor-a.ts",
    ]);
    const b = crawler.crawl(path.join(root, "packages/caps/src/b/cap.ts"));
    expect(b.files).toEqual([
      "packages/caps/src/b/cap.ts",
      "packages/tools/src/http/fetch-json.ts",
      "packages/tools/src/vendor-b.ts",
    ]);
    // `export *` is followed too, and a type-only import reaches nothing.
    const c = crawler.crawl(path.join(root, "packages/caps/src/c/cap.ts"));
    expect(c.files).toEqual([
      "packages/caps/src/c/cap.ts",
      "packages/tools/src/star.ts",
    ]);
  });

  it("editing one vendor changes that Cap's version and no unrelated Cap's", () => {
    const before = fingerprints();
    write(
      "packages/tools/src/vendor-a.ts",
      'import { z } from "zod";\nexport const vendorA = z.number();\n'
    );
    const after = fingerprints();
    expect(after.a).not.toBe(before.a);
    expect(after.b).toBe(before.b);
    expect(after.c).toBe(before.c);
  });

  it("does not hash a barrel, a transport module or a __tests__ file", () => {
    const before = fingerprints();
    write(
      "packages/tools/src/index.ts",
      'export { vendorA } from "./vendor-a";\nexport { vendorB } from "./vendor-b";\nexport * from "./star";\n// edited\n'
    );
    write(
      "packages/tools/src/http/safe-fetch.ts",
      'import { Agent } from "undici";\nexport const guard = Agent; // edited\n'
    );
    write("packages/tools/src/__tests__/x.test.ts", "export const t = 1;\n");
    expect(fingerprints()).toEqual(before);
    // A logic module of the same folder does count.
    write(
      "packages/tools/src/http/fetch-json.ts",
      "export const fetchIt = 2;\n"
    );
    const after = fingerprints();
    expect(after.b).not.toBe(before.b);
    expect(after.a).toBe(before.a);
  });

  it("includes the lockfile version of a reached npm package", () => {
    const before = fingerprints();
    const crawled = new CapCrawler(root).crawl(
      path.join(root, "packages/caps/src/a/cap.ts")
    );
    expect(crawled.packages).toEqual(["zod@4.0.0"]);
    write("pnpm-lock.yaml", lockfile("4.1.0"));
    const after = fingerprints();
    expect(after.a).not.toBe(before.a);
    expect(after.b).toBe(before.b);
  });

  it("fails loudly on a package the lockfile does not list for the importer", () => {
    write(
      "packages/tools/src/star.ts",
      'import "left-pad";\nexport const starred = 1;\n'
    );
    expect(() => fingerprints()).toThrow(/left-pad/);
  });
});

describe("cap fingerprint helpers", () => {
  it("parses importer versions and drops the peer suffix", () => {
    const parsed = parseLockfileImporters(lockfile("4.0.0"));
    expect(parsed.get("packages/tools")?.get("undici")).toBe("8.0.0");
    expect(parsed.get("packages/tools")?.get("zod")).toBe("4.0.0");
  });

  it("excludes only the transport files of tools/http", () => {
    const http = "packages/tools/src/http";
    for (const name of [
      "safe-fetch",
      "capped-body",
      "outbound-client",
      "outbound-policy",
      "http-client-layer",
      "redirect",
      "blocked-address",
      "abort-when",
      "transport-error",
    ]) {
      expect(isExcludedFromFingerprint(`${http}/${name}.ts`), name).toBe(true);
    }
    for (const name of [
      "http-probe",
      "http-probe-headers",
      "unshorten",
      "page-enrich",
      "oembed",
      "fetch-json",
      "fetch-bytes",
      "hop-request",
      "normalize-http-url",
    ]) {
      expect(isExcludedFromFingerprint(`${http}/${name}.ts`), name).toBe(false);
    }
    expect(
      isExcludedFromFingerprint("packages/caps/src/a/__tests__/x.ts")
    ).toBe(true);
    expect(
      isExcludedFromFingerprint("packages/caps/capabilities.gen.json")
    ).toBe(true);
    expect(
      isExcludedFromFingerprint("packages/tools/src/network/whoxy.ts")
    ).toBe(false);
  });

  it("maps every registered Cap to its cap.ts", () => {
    const entries = capEntryFiles(path.join(import.meta.dirname, ".."));
    expect([...entries.keys()].sort()).toEqual(
      CAPABILITIES.map((c) => c.id).sort()
    );
  });
});
