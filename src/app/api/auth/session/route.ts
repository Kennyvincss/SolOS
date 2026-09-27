import { getSession, publicUser } from "@/lib/auth/session";
import { capabilities } from "@/lib/config";
import { ok } from "@/lib/api";

export async function GET() {
  let user = null;
  try {
    user = publicUser(await getSession());
  } catch {
    user = null;
  }
  return ok({ user, capabilities: capabilities() });
}
