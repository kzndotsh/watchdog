import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  appendConnectionsSection,
  appendEvidenceSection,
  appendIdentifiersSection,
  appendQuestionsSection,
  buildEntityFrontmatter,
} from "../export-sections.ts";

describe("export-sections labels", () => {
  it("title-cases entity kind in frontmatter tags", () => {
    const md = buildEntityFrontmatter({
      kind: "person",
      caseSlug: "acme",
      entityId: testId(1),
    });
    expect(md).toContain("tags: [Person]");
  });

  it("uses human labels for evidence rows", () => {
    const lines: string[] = [];
    appendEvidenceSection(lines, [
      {
        id: testId(40),
        kind: "url_archive",
        label: null,
        sourceUrl: "https://example.com/page",
        uri: null,
      } as never,
    ]);
    expect(lines.join("\n")).toContain("URL Archive · example.com");
    expect(lines.join("\n")).not.toContain("URL Archive · URL Archive");
  });

  it("avoids duplicating kind when no label or source url exists", () => {
    const lines: string[] = [];
    appendEvidenceSection(lines, [
      {
        id: testId(41),
        kind: "file",
        label: null,
        sourceUrl: null,
        uri: null,
      } as never,
    ]);
    expect(lines.join("\n")).toContain(`- ${testId(41).slice(0, 8)} · File`);
    expect(lines.join("\n")).not.toContain("File · File");
  });

  it("uses predicate labels for connections", () => {
    const lines: string[] = [];
    appendConnectionsSection(
      lines,
      [
        {
          predicate: "primary_domain",
          toId: testId(2),
          notes: null,
        } as never,
      ],
      new Map([
        [
          testId(2),
          {
            id: testId(2),
            slug: "acme-corp",
            name: "Acme Corp",
            kind: "org",
          } as never,
        ],
      ])
    );
    expect(lines.join("\n")).toContain("Primary domain:: [[acme-corp]]");
  });

  it("sorts connections by peer label", () => {
    const peerZ = testId(2);
    const peerA = testId(3);
    const lines: string[] = [];
    appendConnectionsSection(
      lines,
      [
        {
          predicate: "related_to",
          toId: peerZ,
          notes: "zeta",
        } as never,
        {
          predicate: "primary_domain",
          toId: peerA,
          notes: null,
        } as never,
      ],
      new Map([
        [
          peerZ,
          {
            id: peerZ,
            slug: "zeta-corp",
            name: "Zeta Corp",
            kind: "org",
          } as never,
        ],
        [
          peerA,
          {
            id: peerA,
            slug: "acme-corp",
            name: "",
            kind: "org",
          } as never,
        ],
      ])
    );
    const body = lines.join("\n");
    const acmeIdx = body.indexOf("[[acme-corp]]");
    const zetaIdx = body.indexOf("[[zeta-corp]]");
    expect(acmeIdx).toBeGreaterThanOrEqual(0);
    expect(zetaIdx).toBeGreaterThan(acmeIdx);
  });

  it("title-cases identifier table cells", () => {
    const lines: string[] = [];
    appendIdentifiersSection(lines, [
      {
        type: "ip",
        platform: "",
        value: "1.2.3.4",
        status: "current",
        confidence: "unverified",
      } as never,
    ]);
    expect(lines.join("\n")).toContain(
      "| IP | — | 1.2.3.4 | Current | Unverified |"
    );
  });

  it("uses canonical identifier type labels in export tables", () => {
    const lines: string[] = [];
    appendIdentifiersSection(lines, [
      {
        type: "pgp",
        platform: "",
        value: "ABCD1234",
        status: "unknown",
        confidence: "possible",
      } as never,
    ]);
    expect(lines.join("\n")).toContain(
      "| PGP | — | ABCD1234 | Unknown | Possible |"
    );
  });

  it("title-cases open question status", () => {
    const lines: string[] = [];
    appendQuestionsSection(lines, [
      { text: "Who owns the domain?", status: "open" } as never,
    ]);
    expect(lines.join("\n")).toContain("— Open");
  });
});
