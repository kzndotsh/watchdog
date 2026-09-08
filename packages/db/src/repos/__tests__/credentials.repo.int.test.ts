import { describe, expect, it } from "vitest";

import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { withTestTx } from "@watchdog/test-kit/db";

import { credentialsRepo } from "../credentials.repo.ts";

describe("credentialsRepo", () => {
  it("stores ciphertext and omits it from listMeta", async () => {
    await withTestTx(async (tx) => {
      const blob = Buffer.from("sealed-bytes");
      const created = await credentialsRepo.create(tx, {
        userId: TEST_ACTOR_ID,
        name: "WHOIS_API_KEY",
        ciphertext: blob,
        label: "WhoisXML",
      });
      expect(created?.name).toBe("WHOIS_API_KEY");
      expect(created).not.toHaveProperty("ciphertext");

      const meta = await credentialsRepo.listMeta(tx, TEST_ACTOR_ID);
      expect(meta.some((row) => row.name === "WHOIS_API_KEY")).toBe(true);
      expect(JSON.stringify(meta)).not.toContain("sealed-bytes");

      const stored = await credentialsRepo.getCiphertext(
        tx,
        TEST_ACTOR_ID,
        "WHOIS_API_KEY"
      );
      expect(stored?.equals(blob)).toBe(true);

      expect(
        await credentialsRepo.deleteByName(tx, TEST_ACTOR_ID, "WHOIS_API_KEY")
      ).toBe(true);
    });
  });

  it("trims padded labels on create and update", async () => {
    await withTestTx(async (tx) => {
      const created = await credentialsRepo.create(tx, {
        userId: TEST_ACTOR_ID,
        name: "TRIMMED_LABEL_KEY",
        ciphertext: Buffer.from("bytes"),
        label: "  WhoisXML  ",
      });
      expect(created?.label).toBe("WhoisXML");

      const id = created?.id;
      expect(id).toBeTruthy();
      const updated = await credentialsRepo.update(tx, id!, {
        ciphertext: Buffer.from("bytes2"),
        label: "  Updated  ",
      });
      expect(updated?.label).toBe("Updated");

      const blanked = await credentialsRepo.update(tx, id!, {
        ciphertext: Buffer.from("bytes3"),
        label: "   ",
      });
      expect(blanked?.label).toBe(null);

      await credentialsRepo.deleteByName(
        tx,
        TEST_ACTOR_ID,
        "TRIMMED_LABEL_KEY"
      );
    });
  });
});
