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

afterEach(() => {
  cleanup();
  // Per-viewer state (list display, recent searches) persists in storage: a test that sets it
  // would otherwise hand it to every later test in the worker, and to its own repeats.
  window.localStorage.clear();
  window.sessionStorage.clear();
});
