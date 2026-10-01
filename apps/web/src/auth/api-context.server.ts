import "@tanstack/react-start/server-only";
import { auth } from "@/auth/server";
import {
  actorFromSession,
  createApiContext as createContextFor,
} from "@watchdog/auth/server";

export { actorFromSession };

export async function createApiContext(request: Request) {
  return createContextFor(auth, request);
}
