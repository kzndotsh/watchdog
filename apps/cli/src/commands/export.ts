import { defineCommand } from "citty";

import { emitOk, fail } from "../client";
import { downloadToFile } from "../download";
import { withExamples } from "../examples";
import { formatArgs, requiredCaseArg } from "../noun";

function stamp(): string {
  return new Date().toISOString().slice(0, 16).replaceAll(/[-T:]/g, "");
}

export const exportCmd = defineCommand({
  meta: {
    name: "export",
    description: "Download Case Export zip or entity markdown",
  },
  run: () => {
    fail("USAGE", "Specify a subcommand: zip or md", {
      help: ["wd export zip -c <caseId>", "wd export md -c <caseId> -e <slug>"],
    });
  },
  subCommands: {
    zip: defineCommand({
      meta: {
        name: "zip",
        description: withExamples(
          "Download Case package zip (entities + evidence)",
          [
            "wd export zip -c <caseId>",
            "wd export zip -c <caseId> -o ./case.zip",
          ]
        ),
      },
      args: {
        ...requiredCaseArg,
        out: {
          type: "string",
          alias: "o",
          description: "Output path (optional)",
        },
        ...formatArgs,
      },
      run: async ({ args }) => {
        const outPath = await downloadToFile({
          urlPath: `/cases/${args.case}/export.zip`,
          outPath: args.out,
          fallbackFilename: `${args.case}-${stamp()}.zip`,
        });
        if (args.raw) {
          console.log(outPath);
          return;
        }
        emitOk({ path: outPath });
      },
    }),
    md: defineCommand({
      meta: {
        name: "md",
        description: "Download one entity as Obsidian-style markdown",
      },
      args: {
        ...requiredCaseArg,
        entity: {
          type: "string",
          alias: "e",
          description: "Entity slug",
          required: true,
        },
        out: {
          type: "string",
          alias: "o",
          description: "Output path (optional)",
        },
        ...formatArgs,
      },
      run: async ({ args }) => {
        const slug = args.entity.trim();
        if (slug === "") {
          fail("USAGE", "--entity is required", {
            help: [`wd export md -c ${args.case} -e <slug>`],
          });
        }
        const outPath = await downloadToFile({
          urlPath: `/cases/${args.case}/entities/${encodeURIComponent(slug)}/export.md`,
          outPath: args.out,
          fallbackFilename: `${slug}-${stamp()}.md`,
        });
        if (args.raw) {
          console.log(outPath);
          return;
        }
        emitOk({ path: outPath });
      },
    }),
  },
});
