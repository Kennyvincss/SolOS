import "server-only";
import { getSession } from "@/lib/auth/session";
import { fail } from "@/lib/api";
import { syncConfigured } from "@/lib/sync-store";

/** The signed-in developer, or an error response. */
export async function developer(): Promise<{ uid: string } | { error: Response }> {
  const s = await getSession();
  if (!s) return { error: fail("Sign in to use the developer dashboard", 401) };
  if (!syncConfigured()) return { error: fail("The developer dashboard isn't available right now.", 501) };
  return { uid: s.uid };
}
