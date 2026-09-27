import { capabilities } from "@/lib/config";
import { ok } from "@/lib/api";

export async function GET() {
  return ok(capabilities(), 60);
}
