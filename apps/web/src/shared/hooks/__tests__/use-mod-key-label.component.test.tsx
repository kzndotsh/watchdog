import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useModKeyLabel } from "@/shared/hooks/use-mod-key-label";

function Probe() {
  return <kbd>{useModKeyLabel()}</kbd>;
}

async function hydrate(container: HTMLElement) {
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, <Probe />);
  });
  return root;
}

describe("useModKeyLabel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates without a mismatch, then shows the platform glyph after mount", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {
      /* captured */
    });

    const serverHtml = renderToString(<Probe />);
    expect(serverHtml).toContain("Ctrl");

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.append(container);
    const root = await hydrate(container);

    expect(errors).not.toHaveBeenCalled();
    expect(container.textContent).toBe("⌘");

    act(() => {
      root?.unmount();
    });
    container.remove();
  });

  it("stays Ctrl on non-Apple platforms", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Probe />);
    document.body.append(container);
    const root = await hydrate(container);

    expect(container.textContent).toBe("Ctrl");

    act(() => {
      root?.unmount();
    });
    container.remove();
  });
});
