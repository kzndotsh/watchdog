/**
 * Write packages/caps/capabilities.gen.json and docs/reference/platform/cap-register.md
 * from live CAPABILITIES.
 * Do not hand-edit the generated file — re-run `pnpm generate:caps`.
 */
import path from "node:path";

import {
  writeCapabilitiesGenFile,
  writeCapRegisterFile,
} from "../src/write-capabilities-gen.ts";

const here = import.meta.dirname;
const outPath = path.join(here, "..", "capabilities.gen.json");
const count = writeCapabilitiesGenFile(outPath);
console.log(`wrote ${count} CapDescriptor(s) → ${outPath}`);

const registerPath = path.join(
  here,
  "..",
  "..",
  "..",
  "docs",
  "reference",
  "platform",
  "cap-register.md"
);
writeCapRegisterFile(registerPath);
console.log(`wrote Cap register → ${registerPath}`);
