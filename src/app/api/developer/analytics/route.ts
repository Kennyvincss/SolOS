import { handle, ok } from "@/lib/api";
import { dayOf, getRecord, usageKey } from "@/lib/services/developer";
import { readJson } from "@/lib/sync-store";
import { developer } from "../_auth";

/** API requests per key per day (last 30 days) and project/submission counts. */
export async function GET() {
  return handle(async () => {
    const d = await developer();
    if ("error" in d) return d.error;
    const r = await getRecord(d.uid);
    const days = Array.from({ length: 30 }, (_, i) => dayOf(Date.now() - (29 - i) * 86_400_000));
    const keys = await Promise.all(
      r.keys.map(async (k) => {
        const counts = await Promise.all(days.map((day) => readJson<number>(usageKey(k.id, day)).then((n) => Number(n) || 0, () => 0)));
        return { id: k.id, name: k.name, prefix: k.prefix, daily: counts, total: counts.reduce((a, b) => a + b, 0) };
      }),
    );
    return ok({
      days,
      keys,
      projects: { total: r.projects.length, byStatus: r.projects.reduce<Record<string, number>>((m, p) => ((m[p.status] = (m[p.status] ?? 0) + 1), m), {}), byKind: r.projects.reduce<Record<string, number>>((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {}) },
      submissions: r.submissions.length,
    });
  });
}
