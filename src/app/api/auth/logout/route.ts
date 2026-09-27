import { destroySession } from "@/lib/auth/session";
import { ok } from "@/lib/api";

export async function POST() {
  await destroySession();
  return ok({ ok: true });
}
