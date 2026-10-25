import { describe, expect, it } from "vitest";

import { makeCredentialFingerprint } from "../credential-fingerprint";

const KEY_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const KEY_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("makeCredentialFingerprint", () => {
  it("is deterministic, lower-case SHA-256 hex, and is not the value", () => {
    const fp = makeCredentialFingerprint(KEY_A);
    const first = fp("hunter2", "plaintext");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(fp("hunter2", "plaintext")).toBe(first);
    expect(makeCredentialFingerprint(KEY_A)("hunter2", "plaintext")).toBe(
      first
    );
    expect(first).not.toContain("hunter2");
    expect(fp("hunter3", "plaintext")).not.toBe(first);
  });

  it("differs per key, so fingerprints cannot be compared across instances", () => {
    expect(makeCredentialFingerprint(KEY_A)("hunter2", "plaintext")).not.toBe(
      makeCredentialFingerprint(KEY_B)("hunter2", "plaintext")
    );
  });

  it("keeps a plaintext and a hash of the same text apart", () => {
    const fp = makeCredentialFingerprint(KEY_A);
    expect(fp("5f4dcc3b5aa765d61d8327deb882cf99", "plaintext")).not.toBe(
      fp("5f4dcc3b5aa765d61d8327deb882cf99", "hash")
    );
  });
});
