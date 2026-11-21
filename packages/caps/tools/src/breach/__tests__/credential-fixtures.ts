import { createHmac } from "node:crypto";

import type { CredentialFingerprint, CredentialHandling } from "../credentials";

/** Obviously fake credentials: never a real leaked value. */
export const FAKE_PASSWORD = "hunter2";
export const FAKE_BCRYPT = `$2b$10$${"a".repeat(53)}`;
export const FAKE_MD5 = "5f4dcc3b5aa765d61d8327deb882cf99";
export const FAKE_SHA1 = "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8";

/** A keyed fingerprint under a test key, as core's `makeCredentialFingerprint` shapes it. */
export function testFingerprint(key: string): CredentialFingerprint {
  return (value, role) =>
    createHmac("sha256", key).update(`${role}\0${value}`).digest("hex");
}

export const FULL: CredentialHandling = {
  mode: "full",
  fingerprint: testFingerprint("test-key"),
};

export const SAFE: CredentialHandling = {
  mode: "safe",
  fingerprint: testFingerprint("test-key"),
};
