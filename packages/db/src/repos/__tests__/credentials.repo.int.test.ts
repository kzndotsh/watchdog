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
});
