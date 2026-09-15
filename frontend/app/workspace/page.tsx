import type { Metadata } from "next";
import { Workspace } from "./Workspace";

export const metadata: Metadata = { title: "Workspace" };

export default function WorkspacePage() {
  return (
    <div className="demo-workspace flex min-h-[calc(100vh-80px)] flex-col lg:h-full lg:min-h-0">
      <div className="mb-2 flex shrink-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-3"><p className="eyebrow">Workspace</p><h1 className="text-base font-semibold tracking-tight text-white">Satellite intelligence</h1></div>
        <p className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600 sm:block">Image · Question · Evidence</p>
      </div>
      <Workspace />
    </div>
  );
}
