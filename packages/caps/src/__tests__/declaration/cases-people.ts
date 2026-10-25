import { HttpResponse } from "@watchdog/test-kit/http";

import {
  EMAIL,
  EVIDENCE_ID,
  HOST,
  PAGE_URL,
  type DeclarationCase,
} from "./case";

/** Archive, breach, evidence and identity Caps. */
export const PEOPLE_CASES: readonly DeclarationCase[] = [
  {
    id: "archive.commoncrawl.lookup",
    inputs: [{ host: HOST }],
    respond: (url) => {
      if (url.pathname === "/collinfo.json") {
        return HttpResponse.json([
          {
            id: "CC-MAIN-2024-10",
            "cdx-api": "https://index.commoncrawl.org/CC-MAIN-2024-10-index",
          },
        ]);
      }
      return HttpResponse.text("");
    },
  },
  {
    id: "archive.page.history",
    inputs: [{ url: PAGE_URL }],
    respond: (url) => {
      if (url.pathname === "/cdx/search/cdx") {
        return HttpResponse.json([
          [
            "timestamp",
            "original",
            "statuscode",
            "mimetype",
            "digest",
            "length",
          ],
          ["20240101000000", PAGE_URL, "200", "text/html", "AAAA", "100"],
        ]);
      }
      return HttpResponse.text("<html><title>x</title></html>", {
        headers: { "content-type": "text/html" },
      });
    },
  },
  { id: "archive.url.submit", inputs: [{ url: PAGE_URL }] },
  {
    id: "archive.wayback.fetch",
    inputs: [{ url: PAGE_URL }, { url: PAGE_URL, timestamp: "20240101000000" }],
  },
  { id: "archive.wayback.lookup", inputs: [{ url: PAGE_URL }] },
  { id: "breach.dehashed.lookup", inputs: [{ query: EMAIL }] },
  { id: "breach.hibp.lookup", inputs: [{ email: EMAIL }] },
  { id: "breach.hudsonrock.lookup", inputs: [{ query: EMAIL }] },
  { id: "breach.snusbase.lookup", inputs: [{ query: EMAIL }] },
  {
    id: "evidence.eml.analyze",
    inputs: [{ evidenceId: EVIDENCE_ID }],
    evidenceText: "From: ada@mailhost.test\r\n\r\nSee https://mailhost.test/x",
  },
  {
    id: "evidence.extract.ai",
    inputs: [{ evidenceId: EVIDENCE_ID }],
    run: { modelHost: "api.anthropic.com" },
    evidenceText: "Contact ada@mailhost.test about the invoice",
  },
  {
    id: "evidence.file.analyze",
    inputs: [{ evidenceId: EVIDENCE_ID }],
    evidenceText: "plain text file",
  },
  {
    id: "evidence.harvest",
    inputs: [{ evidenceId: EVIDENCE_ID }],
    evidenceText: "Contact ada@mailhost.test or visit https://mailhost.test/x",
  },
  {
    id: "identity.email.lookup",
    inputs: [{ email: EMAIL }],
    run: { targetHost: HOST },
  },
  { id: "identity.emailrep.lookup", inputs: [{ email: EMAIL }] },
  { id: "identity.github.lookup", inputs: [{ handle: "octocat" }] },
  { id: "identity.gravatar.lookup", inputs: [{ email: EMAIL }] },
  { id: "identity.keybase.lookup", inputs: [{ query: "ada" }] },
  { id: "identity.pgp.lookup", inputs: [{ query: EMAIL }] },
];
