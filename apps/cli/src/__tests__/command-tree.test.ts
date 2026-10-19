import { defineCommand, runCommand } from "citty";
import { describe, expect, it, vi } from "vitest";

import { wrapCommandTree } from "../io";

function tree() {
  const parent = vi.fn();
  const child = vi.fn();
  const cmd = wrapCommandTree(
    defineCommand({
      meta: { name: "noun" },
      args: { case: { type: "string", alias: "c" } },
      run: parent,
      subCommands: {
        list: defineCommand({ meta: { name: "list" }, run: child }),
      },
    })
  );
  return { cmd, parent, child };
}

describe("wrapCommandTree", () => {
  it("runs only the subcommand when one is named", async () => {
    const { cmd, parent, child } = tree();
    await runCommand(cmd, { rawArgs: ["list"] });
    expect(child).toHaveBeenCalledOnce();
    expect(parent).not.toHaveBeenCalled();
  });

  it("runs the parent when no subcommand is named", async () => {
    const { cmd, parent, child } = tree();
    await runCommand(cmd, { rawArgs: ["-c", "list"] });
    expect(parent).toHaveBeenCalledOnce();
    expect(child).not.toHaveBeenCalled();
  });

  it("runs only the leaf two levels down", async () => {
    const root = vi.fn();
    const noun = vi.fn();
    const leaf = vi.fn();
    const cmd = wrapCommandTree(
      defineCommand({
        meta: { name: "wd" },
        run: root,
        subCommands: {
          entities: defineCommand({
            meta: { name: "entities" },
            args: { case: { type: "string", alias: "c" } },
            run: noun,
            subCommands: {
              create: defineCommand({
                meta: { name: "create" },
                args: { name: { type: "string" } },
                run: leaf,
              }),
            },
          }),
        },
      })
    );
    await runCommand(cmd, {
      rawArgs: ["entities", "create", "-c", "x", "--name", "y"],
    });
    expect(leaf).toHaveBeenCalledOnce();
    expect(noun).not.toHaveBeenCalled();
    expect(root).not.toHaveBeenCalled();
  });
});
