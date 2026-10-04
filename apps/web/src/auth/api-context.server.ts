import "@tanstack/react-start/server-only";
import { auth } from "@/auth/server";
import { createApiContext as createContextFor } from "@watchdog/auth/server";

export async function createApiContext(request: Request) {
  return createContextFor(auth, request);
}
