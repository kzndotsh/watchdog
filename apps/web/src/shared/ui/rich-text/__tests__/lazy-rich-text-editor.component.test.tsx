import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";

/**
 * A fresh lazy editor (and so a fresh loader cache) over a gated fake of the real editor
 * module. The factory runs when the dynamic import starts, so `loads.count` is the number of
 * import requests that reached the module; `release` opens the gate. Every test gets its own
 * gate and count, because the loader caches its import for the life of the module.
 */
async function loadLazyEditor() {
  vi.resetModules();
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  const loads = { count: 0 };
  vi.doMock("@/shared/ui/rich-text/rich-text-editor", async () => {
    loads.count += 1;
    await opened;
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
  const mod = await import("@/shared/ui/rich-text");
  return { ...mod, loads, release };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lazy RichTextEditor", () => {
  it("shows the editor skeleton through the show-delay, then the editor once the chunk resolves", async () => {
    const { RichTextEditor, release } = await loadLazyEditor();
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

    release();

    expect(await screen.findByRole("textbox", { name: "Notes" })).toHaveValue(
      "draft"
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("passes edits and shell blur through to the loaded editor", async () => {
    const { RichTextEditor, release } = await loadLazyEditor();
    release();
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
    const { preloadRichTextEditor, loads, release } = await loadLazyEditor();
    release();
    await Promise.all([preloadRichTextEditor(), preloadRichTextEditor()]);
    await preloadRichTextEditor();
    expect(loads.count).toBe(1);
  });
});
