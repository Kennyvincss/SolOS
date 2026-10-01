"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// The dialog (search catalog, results) loads the first time it's opened.
const CommandBarDialog = dynamic(() => import("./command-bar").then((m) => m.CommandBarDialog), { ssr: false });

export function openCommandBar() {
  window.dispatchEvent(new Event("sos:command"));
}

/** ⌘K / Ctrl+K or "/" opens the command bar anywhere. */
export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);

  useEffect(() => {
    const show = (v: boolean | ((o: boolean) => boolean)) => {
      setUsed(true);
      setOpen(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show((o) => !o);
      } else if (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName) && !(e.target as HTMLElement)?.isContentEditable) {
        e.preventDefault();
        show(true);
      }
    };
    const onOpen = () => show(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("sos:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sos:command", onOpen);
    };
  }, []);

  return used ? <CommandBarDialog open={open} setOpen={setOpen} /> : null;
}
