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
