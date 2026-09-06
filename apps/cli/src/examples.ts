/** Append copy-paste Examples to a citty meta.description (citty has no examples field). */
export function withExamples(description: string, examples: string[]): string {
  if (examples.length === 0) return description;
  return `${description}\n\nExamples:\n${examples.map((e) => `  ${e}`).join("\n")}`;
}
