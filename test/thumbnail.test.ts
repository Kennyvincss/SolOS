import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { safeImageUrl, thumbnail, thumbSize } from "@/lib/services/thumbnail";

describe("image thumbnails", () => {
  it("only accepts public https image URLs", () => {
    expect(safeImageUrl("https://arweave.net/abc.png")?.hostname).toBe("arweave.net");
    for (const bad of ["http://example.com/a.png", "https://localhost/a.png", "https://127.0.0.1/a.png", "https://10.0.0.5/a", "https://192.168.1.1/a", "https://169.254.169.254/latest", "https://[::1]/a", "https://user:pw@example.com/a", "https://example.com:8443/a", "https://intranet/a", "file:///etc/passwd", null, ""]) {
      expect(safeImageUrl(bad as string | null)).toBeNull();
    }
  });

  it("rounds sizes to a few cached variants", () => {
    expect(thumbSize("22")).toBe(24);
    expect(thumbSize("36")).toBe(40);
    expect(thumbSize("88")).toBe(96);
    expect(thumbSize("9999")).toBe(128);
    expect(thumbSize(null)).toBe(64);
  });

  it("turns a big logo into a small WebP", async () => {
    const big = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 120, g: 80, b: 220, alpha: 1 } } })
      .composite([{ input: Buffer.from('<svg width="1024" height="1024"><circle cx="512" cy="512" r="400" fill="#fff"/></svg>') }])
      .png({ compressionLevel: 0 })
      .toBuffer();
    const out = await thumbnail(big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength) as ArrayBuffer, 24);
    expect(out).not.toBeNull();
    const meta = await sharp(Buffer.from(out!)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(48);
    expect(out!.byteLength).toBeLessThan(big.byteLength / 50);
  });

  it("returns null for data that isn't an image", async () => {
    expect(await thumbnail(new TextEncoder().encode("not an image").buffer as ArrayBuffer, 32)).toBeNull();
  });
});
