import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Browser APIs happy-dom does not implement usefully (Base UI and dnd-kit call them). Set
// here, once per file before the leak canary's snapshot, so no test patches the shared
// prototype itself and leaves it changed for the next file in the worker.
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {
  // No layout in happy-dom: nothing to scroll.
};
// Shiki 4.6 inflates its inlined Oniguruma wasm with `Response#bytes()`, which browsers and
// Node have and happy-dom's `Response` lacks. Revisit (remove) when happy-dom implements it.
if (!("bytes" in Response.prototype)) {
  Object.defineProperty(Response.prototype, "bytes", {
    configurable: true,
    writable: true,
    async value(this: Response): Promise<Uint8Array> {
      return new Uint8Array(await this.arrayBuffer());
    },
  });
}

afterEach(() => {
  cleanup();
  // Per-viewer state (list display, recent searches) persists in storage: a test that sets it
  // would otherwise hand it to every later test in the worker, and to its own repeats.
  window.localStorage.clear();
  window.sessionStorage.clear();
});
