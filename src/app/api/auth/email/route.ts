import { z } from "zod";
import { config } from "@/lib/config";
import { sign } from "@/lib/auth/session";
import { originFor } from "@/lib/auth/origin";
import { fail, handle, ok } from "@/lib/api";
import { rateLimited } from "@/lib/ai/run";

/**
 * Passwordless email sign-in. Sends a signed, 15-minute magic link through
 * Resend (RESEND_API_KEY). In local development without a provider, the link
 * is returned in the response so the flow can be tested.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const parsed = z.object({ email: z.string().email().max(200) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Enter a valid email address");
    const email = parsed.data.email.toLowerCase();
    if (rateLimited(`email:${email}`, 3, 10 * 60_000)) return fail("Too many sign-in emails. Try again in a few minutes.", 429);
    const token = sign({ email, exp: Math.floor(Date.now() / 1000) + 15 * 60 });
    const link = `${originFor(req)}/api/auth/email/verify?token=${encodeURIComponent(token)}`;

    if (config.resendApiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${config.resendApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: config.emailFrom,
          to: email,
          subject: "Your Solana OS sign-in link",
          text: `Sign in to Solana OS:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
        }),
      });
      if (!res.ok) return fail("Could not send the email. Please try again.", 502);
      return ok({ sent: true });
    }
    if (config.isProd) return fail("Email sign-in isn't available yet. Sign in with your wallet or Google instead.", 501);
    return ok({ sent: false, devLink: link });
  });
}
