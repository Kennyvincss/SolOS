/** Compare dotted versions ("0.2.10" > "0.2.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

interface Release {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  html_url: string;
  assets?: { name: string; browser_download_url: string }[];
}

/** The newest published mobile release (tag "mobile-vX.Y.Z") that is newer than `current`, with its APK link. */
export function newerMobileRelease(releases: Release[], current: string): { version: string; apk: string | null; page: string } | null {
  let best: { version: string; apk: string | null; page: string } | null = null;
  for (const r of releases) {
    const m = /^mobile-v(\d+\.\d+\.\d+)$/.exec(r.tag_name ?? "");
    if (!m || r.draft || r.prerelease) continue;
    if (compareVersions(m[1], current) <= 0) continue;
    if (best && compareVersions(m[1], best.version) <= 0) continue;
    const apk = r.assets?.find((a) => a.name.endsWith(".apk"))?.browser_download_url ?? null;
    best = { version: m[1], apk, page: r.html_url };
  }
  return best;
}
