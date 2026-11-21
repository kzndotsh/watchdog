import { describe, expect, it } from "vitest";

import { pageTextOf } from "../change-summary";
import { decodeCapture } from "../charset";
import { prepareCapture } from "../prepare-capture";
import { stripWaybackArtifacts } from "../strip";

const TOOLBAR = `<!-- BEGIN WAYBACK TOOLBAR INSERT -->
<script src="//archive.org/includes/athena.js"></script>
<div id="wm-ipp-base">Wayback toolbar</div>
<!-- END WAYBACK TOOLBAR INSERT -->`;

const PAGE = (head: string, tail: string) =>
  `<html><head><title>Ada</title>${head}</head><body><p>Hello</p>${tail}</body></html>`;

const ARCHIVE_COMMENT = `<!--
     FILE ARCHIVED ON 03:04:05 Jan 1, 2019 AND RETRIEVED FROM THE
     INTERNET ARCHIVE ON 10:11:12 Jun 5, 2024.
-->`;

describe("stripWaybackArtifacts", () => {
  it("removes the toolbar block", () => {
    const out = stripWaybackArtifacts(PAGE("", TOOLBAR));
    expect(out).not.toMatch(/wm-ipp|toolbar/i);
    expect(out).toContain("<p>Hello</p>");
  });

  it("removes assets the archive injects, matched on the element's own attributes", () => {
    const out = stripWaybackArtifacts(
      PAGE(
        `<script src="/_static/js/bundle-playback.js?v=1"></script>
<script src="//web-static.archive.org/_static/js/wombat.js"></script>
<script src="https://web.archive.org/includes/analytics.js"></script>
<script id="wombat-init">window.x = 1;</script>
<style class="wm-ipp-style">.a{}</style>
<link rel="stylesheet" href="/_static/css/banner-styles.css">
<link rel="stylesheet" href="https://web-static.archive.org/_static/css/iconochive.css">
<script>var mine = 1;</script>`,
        ""
      )
    );
    expect(out).not.toMatch(
      /bundle-playback|wombat|analytics\.js|wm-ipp|banner-styles|iconochive/
    );
    expect(out).toContain("var mine = 1;");
  });

  it("keeps a page's own script and stylesheet under a /_static/js/ path", () => {
    const head = `<script src="/assets/_static/js/app.js"></script>
<script src="https://example.com/_static/js/site.js"></script>
<script src="/_static/js/app.js"></script>
<link rel="stylesheet" href="/_static/css/site.css">`;
    expect(stripWaybackArtifacts(PAGE(head, ""))).toBe(PAGE(head, ""));
  });

  it("never matches an inline script's text", () => {
    const head = `<script>/* <img src="https://web.archive.org/a.png" id="wm-ipp" class="wombat"> */ var w = "wombat"; var p = "/_static/js/bundle-playback.js"; var h = "web.archive.org";</script>
<style>/* wm-ipp */ .wombat { color: red }</style>`;
    expect(stripWaybackArtifacts(PAGE(head, ""))).toBe(PAGE(head, ""));
  });

  it("removes the archive's trailing comments but keeps the page's own", () => {
    const out = stripWaybackArtifacts(
      PAGE(
        "",
        `<!-- a real comment about the Wayback Machine -->${ARCHIVE_COMMENT}
<!-- playback timings (ms): captures_list: 100 -->`
      )
    );
    expect(out).not.toMatch(/FILE ARCHIVED|playback timings/);
    expect(out).toContain("<!-- a real comment about the Wayback Machine -->");
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

  it("gives two captures that differ only in Wayback furniture the same content hash", () => {
    const a = prepareCapture(encode(PAGE("", TOOLBAR)), "text/html");
    const b = prepareCapture(encode(PAGE("", ARCHIVE_COMMENT)), "text/html");
    expect(a.rawSha256).not.toBe(b.rawSha256);
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("keeps two captures that differ only in page code as two versions", () => {
    const withScript = (src: string) =>
      PAGE(`<script src="${src}"></script>`, "");
    const a = prepareCapture(
      encode(withScript("/assets/_static/js/v1.js")),
      "text/html"
    );
    const b = prepareCapture(
      encode(withScript("/assets/_static/js/v2.js")),
      "text/html"
    );
    expect(a.contentHash).not.toBe(b.contentHash);

    const inline = (word: string) =>
      PAGE(`<script>var w = "wombat ${word}";</script>`, "");
    expect(
      prepareCapture(encode(inline("one")), "text/html").contentHash
    ).not.toBe(prepareCapture(encode(inline("two")), "text/html").contentHash);
  });

  it("gives a different hash when the page itself differs", () => {
    const a = prepareCapture(encode(PAGE("", "")), "text/html");
    const b = prepareCapture(
      encode(PAGE("", "").replace("Hello", "Goodbye")),
      "text/html"
    );
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("hashes a body that is not HTML as received", () => {
    const prepared = prepareCapture(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe]),
      "application/pdf"
    );
    expect(prepared.contentHash).toBe(prepared.rawSha256);
  });
});

describe("decodeCapture", () => {
  /** "café" in Windows-1252: é is the single byte 0xE9, which is invalid UTF-8. */
  const win1252 = (head: string) =>
    new Uint8Array([
      ...new TextEncoder().encode(`<html><head>${head}<title>caf`),
      0xe9,
      ...new TextEncoder().encode("</title></head><body><p>caf"),
      0xe9,
      ...new TextEncoder().encode("</p></body></html>"),
    ]);

  it("reads the charset from the Content-Type header first", () => {
    expect(
      decodeCapture(win1252(""), "text/html; charset=windows-1252")
    ).toContain("<p>café</p>");
  });

  it("falls back to <meta charset> and to the http-equiv form", () => {
    expect(
      decodeCapture(win1252('<meta charset="windows-1252">'), "text/html")
    ).toContain("café");
    expect(
      decodeCapture(
        win1252(
          '<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">'
        ),
        null
      )
    ).toContain("café");
  });

  it("falls back to UTF-8 for no or an unknown charset", () => {
    const utf8 = new TextEncoder().encode("<p>café</p>");
    expect(decodeCapture(utf8, "text/html")).toBe("<p>café</p>");
    expect(decodeCapture(utf8, "text/html; charset=not-a-charset")).toBe(
      "<p>café</p>"
    );
  });

  it("gives the page text and title with é intact", () => {
    const page = pageTextOf(
      win1252('<meta charset="windows-1252">'),
      "text/html"
    );
    expect(page?.title).toBe("café");
    expect(page?.text).toBe("café");
  });
});
