import { APPS } from "@/lib/catalog/apps";
import { appMetrics } from "@/lib/services/ecosystem";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const metrics = await appMetrics();
    return ok({ apps: APPS, metrics: metrics.data, meta: metrics.meta }, 600);
  });
}
