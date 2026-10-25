import type { DeclarationRun } from "../../testing";

/**
 * One Cap's declaration test: the inputs to run it with, what the run needs to reach its
 * deeper hosts (fallback vendors, redirect targets), and how the host rules read the input.
 * Every other fact (contacts, credentials) comes from the Cap itself.
 */
export type DeclarationCase = {
  readonly id: string;
  /** Inputs to run the Cap with, one run each. */
  readonly inputs: readonly Record<string, unknown>[];
  /** What the input names and the model endpoint, for the `target` and `model` host rules. */
  readonly run?: DeclarationRun;
  /**
   * Answers one HTTP request of the run, or returns `undefined` for the default answer (a 404
   * with an empty JSON body). A Cap that fails on the default still counts: the test is about
   * the hosts it reached, so give it a body only to get it to a later host.
   */
  readonly respond?: (url: URL) => Response | undefined;
  /** Evidence text packed for a Process Cap. */
  readonly evidenceText?: string;
};

export const HOST = "mailhost.test";
export const IP = "9.9.9.9";
export const EMAIL = "ada@mailhost.test";
export const PAGE_URL = "https://mailhost.test/page";
export const SHA256 = "a".repeat(64);
export const MD5 = "b".repeat(32);
export const EVIDENCE_ID = "00000000-0000-4000-8000-000000000040";
