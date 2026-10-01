"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tiny stale-while-revalidate data hook. Responses are cached in memory for
 * the session, so navigating back to a page is instant while fresh data loads.
 */

type Entry = { data?: unknown; error?: string; at: number; promise?: Promise<unknown> };
const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiGet<T>(url: string): Promise<T> {
  // Plain GET (no extra headers) so it can reuse a <link rel="preload" as="fetch">.
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export async function apiPost<T>(url: string, data: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function load(key: string, force = false): Promise<unknown> {
  const e = cache.get(key);
  if (e?.promise && !force) return e.promise;
  const promise = apiGet(key)
    .then((data) => {
      cache.set(key, { data, at: Date.now() });
      notify(key);
      return data;
    })
    .catch((err: Error) => {
      cache.set(key, { ...cache.get(key), error: err.message, at: Date.now(), promise: undefined });
      notify(key);
      throw err;
    });
  cache.set(key, { ...e, at: e?.at ?? 0, promise });
  return promise;
}

export function useApi<T>(url: string | null, opts: { refreshMs?: number; staleMs?: number } = {}) {
  const { refreshMs, staleMs = 30_000 } = opts;
  const [, force] = useState(0);
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    if (!url) return;
    const l = () => force((n) => n + 1);
    if (!listeners.has(url)) listeners.set(url, new Set());
    listeners.get(url)!.add(l);
    const e = cache.get(url);
    if (!e || (!e.promise && Date.now() - e.at > staleMs) || e.error) load(url, Boolean(e?.error)).catch(() => {});
    let timer: ReturnType<typeof setInterval> | undefined;
    if (refreshMs) timer = setInterval(() => document.visibilityState === "visible" && load(url, true).catch(() => {}), refreshMs);
    return () => {
      listeners.get(url)?.delete(l);
      if (timer) clearInterval(timer);
    };
  }, [url, refreshMs, staleMs]);

  const e = url ? cache.get(url) : undefined;
  const reload = useCallback(() => (urlRef.current ? load(urlRef.current, true).catch(() => {}) : undefined), []);
  return {
    data: e?.data as T | undefined,
    error: e?.data === undefined ? e?.error : undefined,
    loading: Boolean(url) && e?.data === undefined && !e?.error,
    reload,
  };
}
