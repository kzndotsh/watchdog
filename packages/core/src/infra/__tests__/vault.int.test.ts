import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  deleteCredentialEffect,
  getCredentialEffect,
  hasCredentialEffect,
  listCredentialMetaEffect,
  listCredentialSlotsEffect,
  putCredentialEffect,
  putCredentialSlotEffect,
  runDomain,
} from "@watchdog/core";
import { credentialsRepo, db } from "@watchdog/db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { resetTestDb } from "@watchdog/test-kit/db";

const OTHER_USER = "other-actor";

describe("vault", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("round-trips a secret and never lists plaintext", async () => {
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "WHOIS_API_KEY",
        secret: "super-secret",
      })
    );

    expect(
      await runDomain(getCredentialEffect(TEST_ACTOR_ID, "WHOIS_API_KEY"))
    ).toBe("super-secret");
    expect(
      await runDomain(hasCredentialEffect(TEST_ACTOR_ID, "WHOIS_API_KEY"))
    ).toBe(true);

    const meta = await runDomain(listCredentialMetaEffect(TEST_ACTOR_ID));
    expect(JSON.stringify(meta)).not.toContain("super-secret");
    expect(meta.some((row) => row.name === "WHOIS_API_KEY")).toBe(true);
  });

  it("rejects a bad name and an empty secret", async () => {
    await expect(
      runDomain(
        putCredentialEffect({
          userId: TEST_ACTOR_ID,
          name: "not-screaming",
          secret: "x",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );

    await expect(
      runDomain(
        putCredentialEffect({
          userId: TEST_ACTOR_ID,
          name: "WHOIS_API_KEY",
          secret: "   ",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("trims padded credential labels on create and update", async () => {
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "TRIMMED_LABEL_KEY",
        secret: "bytes",
        label: "  WhoisXML  ",
      })
    );
    const meta = await runDomain(listCredentialMetaEffect(TEST_ACTOR_ID));
    const row = meta.find((m) => m.name === "TRIMMED_LABEL_KEY");
    expect(row?.label).toBe("WhoisXML");

    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "TRIMMED_LABEL_KEY",
        secret: "bytes2",
        label: "  Updated  ",
      })
    );
    const updated = await runDomain(listCredentialMetaEffect(TEST_ACTOR_ID));
    expect(updated.find((m) => m.name === "TRIMMED_LABEL_KEY")?.label).toBe(
      "Updated"
    );

    await runDomain(deleteCredentialEffect(TEST_ACTOR_ID, "TRIMMED_LABEL_KEY"));
  });

  it("updates ciphertext for the same name", async () => {
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "WHOIS_API_KEY",
        secret: "first",
      })
    );
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "WHOIS_API_KEY",
        secret: "second",
      })
    );
    expect(
      await runDomain(getCredentialEffect(TEST_ACTOR_ID, "WHOIS_API_KEY"))
    ).toBe("second");
  });

  it("does not open another user's secret", async () => {
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "WHOIS_API_KEY",
        secret: "owner-only",
      })
    );
    await expect(
      runDomain(getCredentialEffect(OTHER_USER, "WHOIS_API_KEY"))
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
    );
  });

  it("maps corrupt vault blobs to invalid", async () => {
    await runDomain(
      putCredentialEffect({
        userId: TEST_ACTOR_ID,
        name: "WHOIS_API_KEY",
        secret: "ok",
      })
    );
    const id = await credentialsRepo.getIdByName(
      db,
      TEST_ACTOR_ID,
      "WHOIS_API_KEY"
    );
    if (id === null) throw new Error("expected credential");
    await credentialsRepo.update(db, id, {
      ciphertext: Buffer.from("too-short"),
      label: null,
    });
    await expect(
      runDomain(getCredentialEffect(TEST_ACTOR_ID, "WHOIS_API_KEY"))
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("marks a known slot configured after putCredentialSlot", async () => {
    const before = await runDomain(listCredentialSlotsEffect(TEST_ACTOR_ID));
    expect(before.find((s) => s.name === "WHOIS_API_KEY")?.configured).toBe(
      false
    );

    const slot = await runDomain(
      putCredentialSlotEffect({
        userId: TEST_ACTOR_ID,
        name: "WHOIS_API_KEY",
        secret: "slot-secret",
      })
    );
    expect(slot.configured).toBe(true);
    expect(JSON.stringify(slot)).not.toContain("slot-secret");

    await runDomain(deleteCredentialEffect(TEST_ACTOR_ID, "WHOIS_API_KEY"));
    expect(
      await runDomain(hasCredentialEffect(TEST_ACTOR_ID, "WHOIS_API_KEY"))
    ).toBe(false);
  });
});
