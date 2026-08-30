export async function resetE2eDb(): Promise<void> {
  const { resetTestDb } = await import("@watchdog/test-kit/db");
  await resetTestDb();
}
