import "server-only";
import { NextResponse } from "next/server";
import { UpstreamError } from "./providers/http";
import { NotFoundError } from "./services/transactions";
import { AuthConfigError } from "./auth/session";

export function ok(data: unknown, maxAge = 0) {
  return NextResponse.json(data, {
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
    if (err instanceof AuthConfigError) return fail(err.message, 500);
    if (err instanceof UpstreamError) return fail(`Data provider unavailable: ${err.message}`, 502);
    console.error(err);
    return fail(err instanceof Error ? err.message : "Unexpected error", 500);
  }
}
