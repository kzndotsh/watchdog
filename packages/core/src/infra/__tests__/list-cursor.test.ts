import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { URL_MAX } from "@watchdog/schemas/shared";

import {
  decodeListCursor,
  encodeListCursor,
  fingerprintOf,
} from "../list-cursor";
import type { ListCursorSpec } from "../list-cursor";

const ID = "11111111-1111-4111-8111-000000000001";
const timeSpec: ListCursorSpec = {
  list: "evidence",
  sort: "captured.desc",
  fingerprint: fingerprintOf("view"),
  key: "time",
  id: "uuid",
};
const textSpec: ListCursorSpec = {
  ...timeSpec,
  sort: "label.asc",
  key: "text",
};

/** A cursor of the right list, view and id whose value the caller forged. */
const forged = (spec: ListCursorSpec, value: string | number) =>
  encodeListCursor(spec, { id: ID, value });

const failureTag = (raw: string, spec: ListCursorSpec) =>
  Effect.runPromise(
    decodeListCursor(raw, spec).pipe(
      Effect.match({
        onFailure: (error) => error._tag,
        onSuccess: () => "decoded",
      })
    )
  );

describe("decodeListCursor", () => {
  it("decodes its own cursor", async () => {
    const value = "2026-01-01T00:10:00.123456Z";
    await expect(
      Effect.runPromise(decodeListCursor(forged(timeSpec, value), timeSpec))
    ).resolves.toEqual({ id: ID, value });
  });

  it("takes digits as the id of an integer-id list, and a uuid as nothing", async () => {
    const intSpec: ListCursorSpec = { ...timeSpec, id: "int" };
    const value = "2026-01-01T00:10:00.123456Z";
    const cursor = (id: string) => encodeListCursor(intSpec, { id, value });
    await expect(
      Effect.runPromise(decodeListCursor(cursor("42"), intSpec))
    ).resolves.toEqual({ id: "42", value });
    expect(await failureTag(cursor(ID), intSpec)).toBe("InvalidError");
    // Past Number.MAX_SAFE_INTEGER a bigint read as a JS number is no longer exact.
    for (const id of ["0", "007", "9007199254740993"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one forged id at a time
      expect(await failureTag(cursor(id), intSpec), id).toBe("InvalidError");
    }
    expect(await failureTag(cursor("9007199254740991"), intSpec)).toBe(
      "decoded"
    );
    expect(await failureTag(forged(timeSpec, value), intSpec)).toBe(
      "InvalidError"
    );
    expect(await failureTag(cursor("42"), timeSpec)).toBe("InvalidError");
  });

  it("refuses a time value of the right shape that is not a real instant", async () => {
    for (const value of [
      "2026-13-45T00:00:00.000000Z",
      "2026-02-30T00:00:00.000000Z",
      "2026-01-01T25:00:00.000000Z",
      "2026-01-01T00:61:00.000000Z",
      "0000-01-01T00:00:00.000000Z",
    ]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one forged value at a time
      expect(await failureTag(forged(timeSpec, value), timeSpec), value).toBe(
        "InvalidError"
      );
    }
  });

  it("refuses a text value Postgres cannot hold or no sort key reaches", async () => {
    for (const value of ["a\u0000b", "x".repeat(URL_MAX + 1)]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one forged value at a time
      expect(await failureTag(forged(textSpec, value), textSpec)).toBe(
        "InvalidError"
      );
    }
    expect(
      await failureTag(forged(textSpec, "x".repeat(URL_MAX)), textSpec)
    ).toBe("decoded");
  });

  it("tells another view's cursor (stale) from a malformed one (invalid)", async () => {
    const value = "2026-01-01T00:10:00.123456Z";
    expect(
      await failureTag(forged(timeSpec, value), {
        ...timeSpec,
        fingerprint: fingerprintOf("other view"),
      })
    ).toBe("StaleCursorError");
    expect(await failureTag("not-a-cursor", timeSpec)).toBe("InvalidError");
  });
});
