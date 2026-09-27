import { news } from "@/lib/services/ecosystem";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => ok(await news(), 300));
}
