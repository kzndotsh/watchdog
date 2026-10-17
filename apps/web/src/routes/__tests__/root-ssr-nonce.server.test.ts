import { QueryClient } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

import { Route as RootRoute } from "@/routes/__root";

const NONCE = "test-nonce-0123456789ab";

afterAll(() => {
  // Router's module cache lives on globalThis; web-unit shares workers between files.
  Reflect.deleteProperty(globalThis, "__TSR_CACHE__");
});

async function renderDocument(nonce: string | undefined): Promise<string> {
  const router = createRouter({
    routeTree: RootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient: new QueryClient() },
    ssr: { nonce },
  });
  await router.load();
  return renderToString(createElement(RouterProvider, { router }));
}

/** Every opening `<script` or `<style` tag in the markup. */
function inlineElementTags(html: string): string[] {
  return html.match(/<(?:script|style)\b[^>]*>/gi) ?? [];
}

describe("root document SSR", () => {
  it("puts the request nonce on every script and style tag", async () => {
    const html = await renderDocument(NONCE);

    const tags = inlineElementTags(html);
    expect(tags.length).toBeGreaterThanOrEqual(2);
    for (const tag of tags) {
      expect(tag).toContain(`nonce="${NONCE}"`);
    }
  });

  it("publishes the nonce in a meta tag so the browser router renders the same attributes", async () => {
    const html = await renderDocument(NONCE);

    expect(html).toMatch(
      new RegExp(`<meta[^>]*property="csp-nonce"[^>]*content="${NONCE}"`)
    );
  });

  it("renders the appearance bootstrap scripts as inline, nonce-carrying scripts", async () => {
    const html = await renderDocument(NONCE);

    expect(html).toContain("localStorage.getItem('theme')");
    expect(html).toContain("wd-display-scale");
    const bootstrap = inlineElementTags(html).filter((tag) =>
      tag.startsWith("<script")
    );
    expect(bootstrap.every((tag) => tag.includes("nonce="))).toBe(true);
  });
});
