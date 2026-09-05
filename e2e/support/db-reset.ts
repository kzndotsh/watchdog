export async function resetE2eDb(): Promise<void> {
  const { resetE2eDb: wipe } = await import("@watchdog/test-kit/db");
  await wipe();
}
