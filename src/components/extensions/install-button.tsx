"use client";

import { Check, Plus } from "lucide-react";
import { useActions, useStore } from "@/lib/client/store";
import type { ExtensionManifest } from "@/lib/extensions/sdk";
import { Toggle, cn } from "../ui";

export function InstallControls({ ext, compact }: { ext: ExtensionManifest; compact?: boolean }) {
  const inst = useStore((s) => s.installed.find((i) => i.id === ext.id));
  const { install, uninstall, toggleExtension } = useActions();
  if (!inst)
    return (
      <button onClick={(e) => (e.preventDefault(), install(ext.id))} className={cn("btn btn-primary", compact && "btn-sm")}>
        <Plus size={14} /> Install
      </button>
    );
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
      <Toggle checked={inst.enabled} onChange={() => toggleExtension(ext.id)} label={inst.enabled ? "Disable" : "Enable"} />
      <span className="text-[12px] text-muted">{inst.enabled ? "Enabled" : "Disabled"}</span>
      {!compact && (
        <button onClick={() => uninstall(ext.id)} className="btn btn-ghost btn-sm ml-2">
          Remove
        </button>
      )}
      {compact && <Check size={14} className="text-sol-green" />}
    </div>
  );
}
