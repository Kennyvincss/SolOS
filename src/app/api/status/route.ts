import { capabilities, config, PUBLIC_RPC } from "@/lib/config";
import { ok } from "@/lib/api";
import { customRpcRejected } from "@/lib/providers/rpc";
import { syncConfigured } from "@/lib/sync-store";

export async function GET() {
  // Which RPC is in use (never the URL or key) and whether shared storage is on.
  const rpc = config.rpcUrl === PUBLIC_RPC ? "public" : customRpcRejected() ? "custom-rejected" : "custom";
  return ok({ ...capabilities(), rpc, sync: syncConfigured() }, 30);
}
