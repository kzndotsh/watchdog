import { z } from "zod";

import { envGroups } from "./fragments";
import { readFieldMeta, type EnvEntrypoint } from "./meta";
import { processVariables } from "./reference";

/** One variable as the generated `env.example` and configuration reference list it. */
export type EnvRow = {
  readonly name: string;
  readonly group: string;
  readonly description: string;
  readonly sensitive: boolean;
  readonly required: boolean;
  /** Text of the value that applies when unset; `undefined` when there is none. */
  readonly default: string | undefined;
  readonly usedBy: readonly EnvEntrypoint[];
  readonly example: string | undefined;
  /** `schema`: validated by `@watchdog/env/server`. `process`: read elsewhere. */
  readonly source: "schema" | "process";
  readonly inExample: boolean;
};

/** What the schema is given for a variable that is not set. */
const NOT_SET: unknown = undefined;

function defaultText(value: unknown): string {
  if (Array.isArray(value))
    return value.length === 0 ? "empty" : value.join(",");
  return String(value);
}

/**
 * Every variable, schema fields first. `required` and `default` are not
 * written down: they are what the schema does with an unset value, so they
 * cannot drift from validation.
 */
export function envRows(): EnvRow[] {
  const rows: EnvRow[] = [];
  for (const group of envGroups) {
    for (const [name, schema] of Object.entries<z.ZodType>(group.fields)) {
      const meta = readFieldMeta(z.globalRegistry.get(schema));
      if (meta === undefined) {
        throw new Error(
          `${name} has no env metadata: end its field with .meta({ description, sensitive, usedBy })`
        );
      }
      const unset = schema.safeParse(NOT_SET);
      rows.push({
        name,
        group: group.title,
        description: meta.description,
        sensitive: meta.sensitive,
        required: !unset.success,
        default:
          unset.success && unset.data !== undefined
            ? defaultText(unset.data)
            : undefined,
        usedBy: meta.usedBy,
        example: meta.example,
        source: "schema",
        inExample: true,
      });
    }
  }
  for (const variable of processVariables) {
    rows.push({
      name: variable.name,
      group: variable.group,
      description: variable.description,
      sensitive: variable.sensitive,
      required: variable.required,
      default: variable.default,
      usedBy: variable.usedBy,
      example: variable.example,
      source: "process",
      inExample: variable.inExample ?? false,
    });
  }
  return rows;
}
