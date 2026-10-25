import { describe, expect, it } from "vitest";

import { prepareCapture } from "../prepare-capture";
import { stripWaybackArtifacts } from "../strip";

const TOOLBAR = `<!-- BEGIN WAYBACK TOOLBAR INSERT -->
<script src="//archive.org/includes/athena.js"></script>
<div id="wm-ipp-base">Wayback toolbar</div>
<!-- END WAYBACK TOOLBAR INSERT -->`;

const PAGE = (head: string, tail: string) =>
  `<html><head><title>Ada</title>${head}</head><body><p>Hello</p>${tail}</body></html>`;

describe("stripWaybackArtifacts", () => {
  it("removes the toolbar block", () => {
    const out = stripWaybackArtifacts(PAGE("", TOOLBAR));
    expect(out).not.toMatch(/wm-ipp|toolbar/i);
    expect(out).toContain("<p>Hello</p>");
  });

  it("removes playback and wombat scripts but keeps the page's own", () => {
    const out = stripWaybackArtifacts(
      PAGE(
        `<script src="/_static/js/bundle-playback.js?v=1"></script>
<script>window._wb_wombat = {};</script>
<script src="//archive.org/includes/analytics.js?v=2"></script>
<script>window.__wm.init("https://web.archive.org/web");</script>
<script>var mine = 1;</script>
<script src="/js/wombat-tracker.js"></script>`,
        ""
      )
    );
    expect(out).not.toMatch(/bundle-playback|_wb_wombat|analytics\.js|__wm/);
    expect(out).toContain("var mine = 1;");
    expect(out).toContain("/js/wombat-tracker.js");
  });

  it("removes the banner stylesheet and the archive's trailing comments", () => {
    const out = stripWaybackArtifacts(
      PAGE(
        `<link rel="stylesheet" href="/_static/css/banner-styles.css"><link rel="stylesheet" href="/site.css">`,
        `<!-- a real comment -->
<!--
     FILE ARCHIVED ON 03:04:05 Jan 1, 2019 AND RETRIEVED FROM THE
     INTERNET ARCHIVE ON 10:11:12 Jun 5, 2024.
-->
<!-- playback timings (ms): captures_list: 100 -->`
      )
    );
    expect(out).not.toMatch(/banner-styles|FILE ARCHIVED|playback timings/);
    expect(out).toContain('href="/site.css"');
    expect(out).toContain("<!-- a real comment -->");
  });

  it("leaves a clean page unchanged", () => {
    const html = PAGE("<style>p{}</style>", "");
    expect(stripWaybackArtifacts(html)).toBe(html);
  });

  it("does not hang on an unterminated element", () => {
    const html = `<html>${"<script ".repeat(20_000)}`;
    expect(stripWaybackArtifacts(html)).toBe(html);
  });
});

describe("prepareCapture", () => {
  const encode = (text: string) => new TextEncoder().encode(text);

  it("gives two captures that differ only in Wayback furniture the same hash", () => {
    const a = prepareCapture(encode(PAGE("", TOOLBAR)), "text/html");
    const b = prepareCapture(
      encode(
        PAGE(
          "",
          "<!-- FILE ARCHIVED ON 01:01:01 Jan 1, 2020 AND RETRIEVED FROM THE INTERNET ARCHIVE ON 02:02:02 Jan 2, 2021. -->"
        )
      ),
      "text/html"
    );
    expect(a.stripped).toBe(true);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("gives a different hash when the page itself differs", () => {
    const a = prepareCapture(encode(PAGE("", "")), "text/html");
    const b = prepareCapture(
      encode(PAGE("", "").replace("Hello", "Goodbye")),
      "text/html"
    );
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("stores a body that is not HTML as it came", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe]);
    const prepared = prepareCapture(bytes, "application/pdf");
    expect(prepared.bytes).toBe(bytes);
    expect(prepared.stripped).toBe(false);
  });
});
