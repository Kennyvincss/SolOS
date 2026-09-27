import { networkStatus } from "@/lib/services/ecosystem";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => ok(await networkStatus(), 10));
}
