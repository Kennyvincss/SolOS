import { dexVolume, protocols, yields } from "@/lib/services/ecosystem";
import { handle, ok } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const [p, y, v] = await Promise.all([protocols(), yields(), dexVolume()]);
    return ok({ protocols: p, yields: y, dexVolume: v }, 600);
  });
}
