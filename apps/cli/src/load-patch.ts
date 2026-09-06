import { readFileSync } from "node:fs";

import { patchSchema } from "@watchdog/schemas";

function readStdin(): string {
  return readFileSync(0, "utf-8");
}

export function loadPatch(args: {
  patch?: string;
  "patch-file"?: string;
  stdin?: boolean;
}) {
  let raw: string;
  if (args["patch-file"] !== undefined && args["patch-file"] !== "") {
    raw = readFileSync(args["patch-file"], "utf-8");
  } else if (args.stdin === true || args.patch === "-") {
    raw = readStdin();
  } else if (args.patch !== undefined && args.patch !== "") {
    raw = args.patch;
  } else if (process.stdin.isTTY) {
    throw new Error("Provide --patch, --patch-file, or --stdin");
  } else {
    raw = readStdin();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Patch must be valid JSON");
  }

  return patchSchema.parse(parsed);
}
