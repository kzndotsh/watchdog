import { describe, expect, it } from "vitest";

import { envRows } from "../describe";
import { allEnvFields, envGroups } from "../fragments";
import { processVariables } from "../reference";

const rows = envRows();
const byName = new Map(rows.map((row) => [row.name, row]));

describe("env metadata", () => {
  it("groups cover exactly the fields the server validates", () => {
    const grouped = envGroups.flatMap((group) => Object.keys(group.fields));
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(Object.keys(allEnvFields).sort());
  });

  it("gives every field a description, a sensitive flag and an entrypoint", () => {
    const schemaRows = rows.filter((row) => row.source === "schema");
    expect(schemaRows).toHaveLength(Object.keys(allEnvFields).length);
    for (const row of schemaRows) {
      expect(row.description.length, row.name).toBeGreaterThan(10);
      expect(row.usedBy.length, row.name).toBeGreaterThan(0);
    }
  });

  it("never reuses a name between schema fields and process variables", () => {
    expect(new Set(rows.map((row) => row.name)).size).toBe(rows.length);
    expect(processVariables.length).toBeGreaterThan(0);
  });

  it("marks credentials sensitive", () => {
    for (const name of [
      "DATABASE_URL",
      "DATABASE_URL_MIGRATE",
      "BETTER_AUTH_SECRET",
      "S3_SECRET_KEY",
      "WD_MASTER_VAULT_KEY",
      "WD_EGRESS_PROXY",
      "WD_API_KEY",
      "POSTGRES_PASSWORD",
    ]) {
      expect(byName.get(name)?.sensitive, name).toBe(true);
    }
    expect(byName.get("S3_BUCKET")?.sensitive).toBe(false);
  });

  it("derives required and default from the schema, not from prose", () => {
    expect(byName.get("BETTER_AUTH_SECRET")).toMatchObject({
      required: true,
      default: undefined,
    });
    expect(byName.get("S3_REGION")).toMatchObject({
      required: false,
      default: "us-east-1",
    });
    expect(byName.get("BETTER_AUTH_ALLOW_SIGNUP")?.default).toBe("false");
    expect(byName.get("BETTER_AUTH_TRUSTED_ORIGINS")?.default).toBe("empty");
    expect(byName.get("SMTP_HOST")).toMatchObject({
      required: false,
      default: undefined,
    });
  });
});
