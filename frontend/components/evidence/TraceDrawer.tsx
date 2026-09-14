"use client";

import { useState } from "react";
import type { TraceRecord } from "@/lib/types";

export function TraceDrawer({ trace }: { trace: TraceRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border pt-4">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="text-xs font-[500] text-ash hover:text-ivory">{open ? "Hide" : "View"} raw execution evidence</button>
      {open && <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-background p-4 font-mono text-[10px] leading-5 text-midgray">{JSON.stringify(trace, null, 2)}</pre>}
    </div>
  );
}
