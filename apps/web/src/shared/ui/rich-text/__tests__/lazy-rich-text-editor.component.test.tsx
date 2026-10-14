import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";

const gate = vi.hoisted(() => {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release, loads: { count: 0 } };
});

// The real editor module is replaced by a gated fake: the factory runs when the dynamic
// import starts, so `loads.count` is the number of import requests that reached the module.
vi.mock("@/shared/ui/rich-text/rich-text-editor", async () => {
  gate.loads.count += 1;
  await gate.opened;
  return {
    RichTextEditor: ({
      value,
      onChange,
      onBlurShell,
      ariaLabel,
    }: {
      value: string;
      onChange: (next: string) => void;
      onBlurShell?: () => void;
      ariaLabel?: string;
    }) => (
      <textarea
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={() => {
          onBlurShell?.();
        }}
      />
    ),
  };
});

import { preloadRichTextEditor, RichTextEditor } from "@/shared/ui/rich-text";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lazy RichTextEditor", () => {
  it("shows the editor skeleton through the show-delay, then the editor once the chunk resolves", async () => {
    render(
      <RichTextEditor
        value="draft"
        onChange={vi.fn()}
        ariaLabel="Notes"
        variant="seamless"
        toolbar="always"
        shouldFill
      />
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading editor");
    const region = screen.getByRole("generic", { busy: true });
    expect(region).toHaveClass(SKELETON_DELAY_CLASS, "flex-1");
    expect(screen.queryByRole("textbox")).toBeNull();

    gate.release();

    expect(await screen.findByRole("textbox", { name: "Notes" })).toHaveValue(
      "draft"
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("passes edits and shell blur through to the loaded editor", async () => {
    const onChange = vi.fn();
    const onBlurShell = vi.fn();
    render(
      <RichTextEditor
        value=""
        onChange={onChange}
        onBlurShell={onBlurShell}
        ariaLabel="Summary"
      />
    );

    const box = await screen.findByRole("textbox", { name: "Summary" });
    const user = userEvent.setup();
    await user.type(box, "a");
    expect(onChange).toHaveBeenCalledWith("a");

    await user.tab();
    expect(onBlurShell).toHaveBeenCalledTimes(1);
  });

  it("requests the editor chunk once however often it is preloaded or rendered", async () => {
    await Promise.all([preloadRichTextEditor(), preloadRichTextEditor()]);
    await preloadRichTextEditor();
    expect(gate.loads.count).toBe(1);
  });
});
