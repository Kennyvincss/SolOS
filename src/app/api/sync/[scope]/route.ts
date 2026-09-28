import { getSession } from "@/lib/auth/session";
import { fail, handle, ok } from "@/lib/api";
import { readSync, syncConfigured, writeSync } from "@/lib/sync-store";

/**
 * Account sync. GET returns the signed-in user's saved data for a scope;
 * PUT replaces it. Scopes: "web" (watchlist, follows, extensions, settings…)
 * and "desktop" (desktop app bookmarks and settings). Passwords never go here.
 */
const SCOPES = new Set(["web", "desktop"]);
const MAX_BYTES = 512 * 1024;

async function context(params: Promise<{ scope: string }>) {
  const { scope } = await params;
  if (!SCOPES.has(scope)) return { error: fail("Unknown sync scope", 404) };
  if (!syncConfigured()) return { error: fail("Sync isn't set up on this server (add the Upstash Redis integration in Vercel).", 501) };
  const session = await getSession();
  if (!session) return { error: fail("Sign in to sync", 401) };
  return { scope, uid: session.uid };
}

export async function GET(_req: Request, { params }: { params: Promise<{ scope: string }> }) {
  return handle(async () => {
    const c = await context(params);
    if ("error" in c) return c.error!;
    const stored = await readSync(c.uid, c.scope);
    return ok({ data: stored?.data ?? null, updatedAt: stored?.updatedAt ?? 0 });
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ scope: string }> }) {
  return handle(async () => {
    const c = await context(params);
    if ("error" in c) return c.error!;
    const text = await req.text();
    if (text.length > MAX_BYTES) return fail("Sync data is too large", 413);
    let body: { data?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return fail("Invalid JSON");
    }
    if (!body || typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) return fail("Expected { data: {...} }");
    const updatedAt = await writeSync(c.uid, c.scope, body.data);
    return ok({ updatedAt });
  });
}
