import { vi } from "vitest";

// Runs before each test file. With `isolate: false` the module registry would otherwise
// carry over from the previous file, so a file's `vi.mock` could miss modules it imported.
vi.resetModules();
