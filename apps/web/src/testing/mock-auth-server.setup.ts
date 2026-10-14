import { vi } from "vitest";

import { authServerDouble } from "./auth-server-double";

// Vitest setup file (web-unit and component projects): replaces `@/auth/server` once,
// so a test does not repeat the mock to keep server-only code out of its import graph.
// The factory runs lazily, when a test file first imports the module, after this file's
// own import above has evaluated.
vi.mock("@/auth/server", () => authServerDouble());
