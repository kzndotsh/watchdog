import { describe, it } from "vitest";
import { z } from "zod";

import { dehashed } from "../../../providers";
import { contact } from "../../../sdk";
import { defineCollectCap } from "../define-collect-cap";

const schema = z.object({ found: z.boolean() });
const input = z.object({ query: z.string() });

const base = {
  title: "Example",
  provider: dehashed,
  input,
  contacts: [contact.provider("example.test", { keyed: false })],
  schema,
  fetch: () => {
    throw new Error("not run");
  },
  interpretSnap: () => ({ patch: [] }),
};

describe("a breach Cap declares its Export redactor", () => {
  it("is required by type for a breach.* id and refused elsewhere", () => {
    // @ts-expect-error a breach Cap without exportRedaction fails typecheck
    void (() => defineCollectCap({ ...base, id: "breach.example.lookup" }));
    void (() =>
      defineCollectCap({
        ...base,
        id: "breach.example.lookup",
        exportRedaction: "unchanged",
      }));
    void (() => defineCollectCap({ ...base, id: "network.example.lookup" }));
    void (() =>
      defineCollectCap({
        ...base,
        id: "network.example.lookup",
        // @ts-expect-error a non-breach Cap has no redactor to declare
        exportRedaction: "unchanged",
      }));
  });
});
