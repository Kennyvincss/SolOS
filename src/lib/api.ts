import "server-only";
import { NextResponse } from "next/server";
import { UpstreamError } from "./providers/http";
import { NotFoundError } from "./services/transactions";
import { AuthConfigError } from "./auth/session";

/** Internal diagnostics (provider errors, config hints) stay in server logs, not in responses. */
function publicData(data: unknown): unknown {
  if (data && typeof data === "object" && "meta" in data) {
    const d = data as { meta?: Record<string, unknown> };
    if (d.meta && typeof d.meta === "object" && "note" in d.meta) {
      const { note: _note, ...meta } = d.meta;
      return { ...d, meta };
    }
  }
  return data;
}

export function ok(data: unknown, maxAge = 0) {
  return NextResponse.json(publicData(data), {
    headers: maxAge ? { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` } : { "Cache-Control": "no-store" },
  });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wrap a handler so upstream/provider errors become clean JSON errors. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof NotFoundError) return fail(err.message, 404);
    if (err instanceof AuthConfigError) {
      console.error(err);
      return fail("Sign-in is temporarily unavailable. Please try again later.", 500);
    }
    if (err instanceof UpstreamError) {
      console.warn("[upstream]", err.message);
      return fail("Couldn't load this right now. Please try again in a moment.", 502);
    }
    console.error(err);
    return fail("Something went wrong. Please try again.", 500);
  }
}
