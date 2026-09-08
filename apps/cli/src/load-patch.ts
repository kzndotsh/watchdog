import { readFileSync } from "node:fs";

import { patchSchema } from "@watchdog/schemas";

import { fail } from "./io";
import { hasCliText } from "./noun";

export function readStdin(): string {
  return readFileSync(0, "utf-8");
}

const PATCH_HELP = [
  "wd proposals create -c <caseId> --patch-file ./patch.json",
  "cat patch.json | wd graph write -c <caseId> --stdin",
];

export function loadPatch(args: {
  patch?: string;
  "patch-file"?: string;
  stdin?: boolean;
}) {
  let raw: string;
  if (args["patch-file"] !== undefined) {
    if (!hasCliText(args["patch-file"])) {
      fail("USAGE", "Patch file path must not be blank", { help: PATCH_HELP });
    }
    try {
      raw = readFileSync(args["patch-file"].trim(), "utf-8");
    } catch (error) {
      const code =
        error !== null && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const patchPath = args["patch-file"].trim();
      if (code === "ENOENT") {
        fail("USAGE", `Patch file not found: ${patchPath}`, {
          help: PATCH_HELP,
        });
      }
      const message =
        error instanceof Error ? error.message : "failed to read patch file";
      fail("USAGE", message, { help: PATCH_HELP });
    }
  } else if (args.stdin === true || args.patch === "-") {
    raw = readStdin();
  } else if (args.patch !== undefined) {
    if (!hasCliText(args.patch)) {
      fail("USAGE", "Patch JSON must not be empty", { help: PATCH_HELP });
    }
    raw = args.patch;
  } else if (process.stdin.isTTY) {
    fail("USAGE", "Provide --patch, --patch-file, or --stdin", {
      help: PATCH_HELP,
    });
  } else {
    raw = readStdin();
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    fail("USAGE", "Patch JSON must not be empty", { help: PATCH_HELP });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    fail("USAGE", "Patch must be valid JSON", { help: PATCH_HELP });
  }

  const patchResult = patchSchema.safeParse(parsed);
  if (!patchResult.success) {
    fail("USAGE", "Patch must be a non-empty array of patch operations", {
      help: PATCH_HELP,
    });
  }
  if (patchResult.data.length === 0) {
    fail("USAGE", "Patch must contain at least one operation", {
      help: PATCH_HELP,
    });
  }
  return patchResult.data;
}
