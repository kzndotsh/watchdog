import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "fixtures"
        ? []
        : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")
      ? [full]
      : [];
  });
}

/** Source lines of the web app that match `pattern`, as `path:line` (tests excluded). */
function offenders(pattern: RegExp, except: readonly string[] = []): string[] {
  return sourceFiles(SRC).flatMap((file) => {
    const name = path.relative(SRC, file);
    if (except.includes(name)) return [];
    return readFileSync(file, "utf-8")
      .split("\n")
      .flatMap((line, index) =>
        pattern.test(line) ? [`${name}:${index + 1}`] : []
      );
  });
}

describe("web source conventions", () => {
  it("writes failure copy as Couldn't <verb> <noun> through couldnt(), never `<Verb> failed` or `Could not`", () => {
    // A quoted string that ends in " failed" (or " failed (status)"), or starts with "Could not" / "Unable to" / "Oops".
    const pattern =
      /["'`](?:[^"'`\n]* failed(?: \(|["'`])|Could not\b|Unable to\b|Oops\b)/;
    expect(offenders(pattern)).toEqual([]);
  });

  it("has no role=button element: a clickable card is a real button (docs/reference/web/ui/atoms.md Accessibility)", () => {
    expect(offenders(/role="button"/)).toEqual([]);
  });

  it("declares typing delays only in shared/lib/debounce.ts", () => {
    expect(
      offenders(/\bconst\s+\w*DEBOUNCE\w*\s*=\s*\d/, ["shared/lib/debounce.ts"])
    ).toEqual([]);
  });

  it("leaves an organization only through useReloadIntoOrganization, which invalidates the organization state first", () => {
    // The route guard caches the organization state until an organization change invalidates it.
    expect(
      offenders(/switch-organization["']/, [
        "domains/organization/hooks/use-reload-into-organization.ts",
      ])
    ).toEqual([]);
  });
});
