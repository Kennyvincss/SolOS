import "server-only";
import { config } from "../config";

/** Public origin for OAuth redirects and email links. */
export function originFor(req: Request): string {
  if (config.appUrl) return config.appUrl.replace(/\/$/, "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
