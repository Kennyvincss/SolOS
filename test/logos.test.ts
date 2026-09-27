import { describe, expect, it, vi } from "vitest";
import { fetchLogo, logoCandidates } from "@/lib/services/logos";
import { getApp } from "@/lib/catalog/apps";

const img = (bytes: number, type = "image/png", status = 200) => new Response(new Uint8Array(bytes), { status, headers: { "content-type": type } });

describe("app logos", () => {
  it("orders sources: DefiLlama, then X avatar, then website icon", () => {
    const c = logoCandidates(getApp("jupiter")!, "https://icons.llama.fi/jupiter.png");
    expect(c[0]).toBe("https://icons.llama.fi/jupiter.png");
    expect(c[1]).toBe("https://unavatar.io/x/JupiterExchange?fallback=false");
    expect(c[2]).toBe("https://www.google.com/s2/favicons?domain=jup.ag&sz=128");
    // Apps without an X handle still get a website icon.
    expect(logoCandidates(getApp("anchor")!)).toEqual(["https://www.google.com/s2/favicons?domain=anchor-lang.com&sz=128"]);
  });

  it("skips failures, non-images and tiny placeholder icons", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(img(0, "image/png", 404))
      .mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(img(120))
      .mockResolvedValueOnce(img(5000, "image/jpeg"));
    const logo = await fetchLogo(["a", "b", "c", "https://d.example/logo.jpg"], f as unknown as typeof fetch);
    expect(logo?.source).toBe("https://d.example/logo.jpg");
    expect(logo?.contentType).toBe("image/jpeg");
  });

  it("returns null when no source has a logo", async () => {
    const f = vi.fn().mockRejectedValue(new Error("network"));
    expect(await fetchLogo(["a", "b"], f as unknown as typeof fetch)).toBeNull();
  });
});
