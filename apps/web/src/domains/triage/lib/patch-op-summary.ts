import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import type { JsonObject, PatchOp } from "@watchdog/schemas";
import { predicateLabel } from "@watchdog/schemas";

type Resource = PatchOp["resource"];

/** Safely stringify an unknown patch-data field without `[object Object]` noise. */
function stringifyField(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** One-line summary of a patch op body for the Triage ledger. */
export function summarizePatchOpData(
  resource: Resource,
  data: JsonObject
): string {
  switch (resource) {
    case "claim": {
      return stringifyField(data.text, JSON.stringify(data));
    }
    case "identifier": {
      const type = stringifyField(data.type);
      const value = stringifyField(data.value);
      const platform = data.platform
        ? ` (${stringifyField(data.platform)})`
        : "";
      const typeLabel = type === "" ? "Identifier" : kindLabel(type);
      return `${typeLabel}${platform}: ${value}`;
    }
    case "edge": {
      const predicate = stringifyField(data.predicate, "related_to");
      const notes = stringifyField(data.notes);
      const predicateText = predicateLabel(predicate);
      return notes ? `${predicateText} — ${notes}` : predicateText;
    }
    case "event": {
      const when = stringifyField(data.when);
      const what = stringifyField(data.what);
      const where = stringifyField(data.where);
      let head = "";
      if (when && what) {
        head = `${when} — ${what}`;
      } else if (when) {
        head = when;
      } else if (what) {
        head = what;
      } else if (where) {
        return where;
      } else {
        return JSON.stringify(data);
      }
      return where ? `${head} @ ${where}` : head;
    }
    case "question": {
      const text = stringifyField(data.text);
      const resolvedNote = stringifyField(data.resolvedNote);
      if (text && resolvedNote) return `${text} → ${resolvedNote}`;
      if (text) return text;
      if (resolvedNote) return resolvedNote;
      return JSON.stringify(data);
    }
    case "entity": {
      const kind = stringifyField(data.kind);
      const name = stringifyField(data.name);
      const summary = stringifyField(data.summary);
      const notes = stringifyField(data.notes);
      const kindText = kind === "" ? "Entity" : kindLabel(kind);
      const head = name ? `${kindText}: ${name}` : kindText;
      const details = [summary, notes].filter((part) => part !== "");
      if (details.length === 0) return head;
      return `${head} — ${details.join(" · ")}`;
    }
    default: {
      const _exhaustive: never = resource;
      return JSON.stringify(_exhaustive);
    }
  }
}
