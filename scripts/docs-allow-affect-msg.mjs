#!/usr/bin/env node
/**
 * lefthook commit-msg helper.
 * Usage: node ./scripts/docs-allow-affect-msg.mjs {1}
 * Lefthook passes the commit message file as `{1}`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { hasAllowAffect } from "./doc-map.mjs";

const root = path.resolve(import.meta.dirname, "..");
const msgFile = process.argv[2];

if (!msgFile || !existsSync(msgFile)) {
  process.exit(0);
}

try {
  const body = readFileSync(msgFile, "utf-8");
  const stamp = path.join(root, ".git", "docs-allow-affect");
  if (hasAllowAffect(body)) {
    writeFileSync(stamp, msgFile, "utf-8");
  } else if (existsSync(stamp)) {
    writeFileSync(stamp, "", "utf-8");
  }
} catch {
  // never block commit
}

process.exit(0);
