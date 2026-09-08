import { describe, it, expect } from "vitest";

import {
  extractOutboundFromHtml,
  extractOutboundFromMarkdown,
  formatLinksMarkdownSection,
  htmlToText,
  resolveHref,
} from "../to-text.ts";

const BASE = "https://www.example.org/";

describe("to-text", () => {
  it("resolveHref absolutizes relatives and strips hash", () => {
    expect(resolveHref("/wiki/Guide", BASE)).toBe(
      "https://www.example.org/wiki/Guide"
    );
    expect(resolveHref("https://social.example.org/@admin#x", BASE)).toBe(
      "https://social.example.org/@admin"
    );
    expect(resolveHref("#top", BASE)).toBe(null);
    expect(resolveHref("mailto:ops@example.com?subject=hi", BASE)).toBe(
      "ops@example.com"
    );
  });

  it("extractOutboundFromHtml keeps OSINT links, drops assets", () => {
    const html = `
      <a href="/community">c</a>
      <a href="https://wiki.example.org/wiki/Topic">topic</a>
      <a href="https://social.example.org/@admin">admin</a>
      <a href="/user/themes/x.css">css</a>
      <a href="https://schema.org/Organization">schema</a>
      <a href="mailto:hello@example.org">mail</a>
    `;
    const { urls, emails } = extractOutboundFromHtml(html, BASE);
    expect(urls.includes("https://www.example.org/community")).toBeTruthy();
    expect(urls.includes("https://wiki.example.org/wiki/Topic")).toBeTruthy();
    expect(urls.includes("https://social.example.org/@admin")).toBeTruthy();
    expect(!urls.some((u) => u.endsWith(".css"))).toBeTruthy();
    expect(!urls.some((u) => u.includes("schema.org"))).toBeTruthy();
    expect(emails).toEqual(["hello@example.org"]);
  });

  it("extractOutboundFromMarkdown finds link targets and bare URLs", () => {
    const md = `
  See [Topic](https://wiki.example.org/wiki/Topic) and https://docs.example.org/guide.
  ![img](https://cdn.example.com/a.png)
  `;
    const urls = extractOutboundFromMarkdown(md);
    expect(urls.includes("https://wiki.example.org/wiki/Topic")).toBeTruthy();
    expect(urls.includes("https://docs.example.org/guide")).toBeTruthy();
    expect(!urls.some((u) => u.endsWith(".png"))).toBeTruthy();
  });

  it("formatLinksMarkdownSection is harvest-friendly", () => {
    const section = formatLinksMarkdownSection({
      urls: ["https://wiki.example.org/wiki/Guide"],
      emails: ["a@b.co"],
    });
    expect(section).toMatch(/## Outbound links/);
    expect(section).toMatch(/https:\/\/wiki\.example\.org\/wiki\/Guide/);
    expect(section).toMatch(/a@b\.co/);
  });

  it("htmlToText ignores invalid numeric entities instead of throwing", () => {
    expect(htmlToText("<p>&#55296; safe &#65; text</p>")).toBe("safe A text");
    expect(htmlToText("<p>&#9999999; hello</p>")).toBe("hello");
  });
});
