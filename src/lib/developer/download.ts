"use client";

import { makeZip } from "./zip";
import { starterFiles, starterName, type Kind } from "./templates";

/** Download a project's starter files as a .zip. */
export function downloadStarter(p: { kind: Kind; name: string; description: string; version: string; permissions: string[]; matches: string[]; instructions?: string }) {
  const blob = makeZip(starterFiles({ ...p, home: window.location.origin }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = starterName(p.name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
