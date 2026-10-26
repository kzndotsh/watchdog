// Fixture for react-compiler-coverage.test.ts: must report "not compiled".
export function OptedOut({ label = "x" }: { label?: string }) {
  "use no memo";
  return <span>{label}</span>;
}
