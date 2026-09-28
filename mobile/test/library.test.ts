import { describe, expect, it } from "vitest";
import { EMPTY_LIBRARY, addHistory, applyRemote, bookmarkList, isBookmarked, mergeBookmarks, recentHistory, toggleBookmark } from "../src/lib/library";
import { compareVersions, newerMobileRelease } from "../src/lib/version";

describe("library", () => {
  it("toggles bookmarks with tombstones", () => {
    let lib = toggleBookmark(EMPTY_LIBRARY, "https://jup.ag/", "Jupiter", 1);
    expect(isBookmarked(lib, "https://jup.ag/")).toBe(true);
    lib = toggleBookmark(lib, "https://jup.ag/", "Jupiter", 2);
    expect(isBookmarked(lib, "https://jup.ag/")).toBe(false);
    expect(lib.bookmarks["https://jup.ag/"]).toMatchObject({ deleted: true, updatedAt: 2 });
    expect(bookmarkList(lib)).toEqual([]);
  });

  it("merges with the desktop's copy: newest change per URL wins", () => {
    const local = { a: { title: "A", createdAt: 1, updatedAt: 5 }, b: { title: "B", createdAt: 1, updatedAt: 1 } };
    const remote = { a: { title: "A", createdAt: 1, updatedAt: 3, deleted: true }, b: { title: "B", createdAt: 1, updatedAt: 9, deleted: true }, c: { title: "C", createdAt: 2, updatedAt: 2 } };
    const m = mergeBookmarks(local, remote);
    expect(m.a.deleted).toBeUndefined();
    expect(m.b.deleted).toBe(true);
    expect(m.c.title).toBe("C");
  });

  it("applies the account copy and returns what to upload", () => {
    const lib = { ...EMPTY_LIBRARY, settings: { a: 1 }, settingsUpdatedAt: 10 };
    const { lib: next, upload } = applyRemote(lib, { bookmarks: { x: { title: "X", createdAt: 1, updatedAt: 1 } }, settings: { a: 2 }, settingsUpdatedAt: 20 });
    expect(next.settings).toEqual({ a: 2 });
    expect(Object.keys(upload.bookmarks)).toEqual(["x"]);
    expect(applyRemote(lib, null).lib.settings).toEqual({ a: 1 });
  });

  it("keeps history de-duplicated and only for web pages", () => {
    let lib = addHistory(EMPTY_LIBRARY, "https://a.com/", "A", 1);
    lib = addHistory(lib, "https://a.com/", "A2", 2);
    lib = addHistory(lib, "https://b.com/", "B", 3);
    lib = addHistory(lib, "about:blank", "", 4);
    expect(lib.history).toHaveLength(2);
    expect(recentHistory(lib).map((h) => h.url)).toEqual(["https://b.com/", "https://a.com/"]);
  });
});

describe("updates", () => {
  it("compares versions", () => {
    expect(compareVersions("0.2.10", "0.2.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
  });
  it("finds the newest mobile release with an APK", () => {
    const rel = (tag: string, extra = {}) => ({ tag_name: tag, html_url: `https://gh/${tag}`, assets: [{ name: "Solana-OS.apk", browser_download_url: `https://gh/${tag}.apk` }], ...extra });
    const list = [rel("desktop-v0.9.0"), rel("mobile-v0.2.0"), rel("mobile-v0.3.0", { prerelease: true }), rel("mobile-v0.1.0")];
    expect(newerMobileRelease(list, "0.1.0")).toEqual({ version: "0.2.0", apk: "https://gh/mobile-v0.2.0.apk", page: "https://gh/mobile-v0.2.0" });
    expect(newerMobileRelease(list, "0.2.0")).toBeNull();
  });
});
