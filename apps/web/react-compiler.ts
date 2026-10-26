import { reactCompilerPreset } from "@vitejs/plugin-react";

/**
 * The one React Compiler setup of the web app. `vite.config.ts` (the app build), the
 * `component-compiled` Vitest project and the compiled-components check
 * (`src/build/__tests__/react-compiler-coverage.test.ts`) all read it, so what the check
 * compiles is what ships. `infer` compiles every client component and hook; `annotation`
 * only functions marked "use memo".
 */
export type ReactCompilerMode = "infer" | "annotation";

export function reactCompilerBabelPreset(mode: ReactCompilerMode = "infer") {
  return reactCompilerPreset({ compilationMode: mode });
}
